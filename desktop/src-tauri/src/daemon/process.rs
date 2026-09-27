//! What the OS reports about a pid: its executable, start time and arguments.

use std::path::PathBuf;

#[cfg(target_os = "macos")]
pub(super) fn executable(pid: u32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let mut path = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: `path` is writable for the length passed.
    let len = unsafe {
        libc::proc_pidpath(
            pid as libc::c_int,
            path.as_mut_ptr().cast(),
            path.len() as u32,
        )
    };
    let len = usize::try_from(len).ok().filter(|&len| len > 0)?;
    Some(PathBuf::from(std::ffi::OsStr::from_bytes(&path[..len])))
}

/// The kernel marks a replaced binary with ` (deleted)`; the path is the same.
#[cfg(target_os = "linux")]
pub(super) fn executable(pid: u32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let link = std::fs::read_link(format!("/proc/{pid}/exe")).ok()?;
    let bytes = link.as_os_str().as_bytes();
    let bytes = bytes.strip_suffix(b" (deleted)").unwrap_or(bytes);
    Some(PathBuf::from(std::ffi::OsStr::from_bytes(bytes)))
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub(super) fn executable(_pid: u32) -> Option<PathBuf> {
    None
}

/// Read the way the daemon reads its own for `daemon.json`
/// (`src/daemon/server/endpoint.rs`); the two must stay identical.
#[cfg(target_os = "macos")]
pub(super) fn start_time(pid: u32) -> Option<u64> {
    let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::zeroed();
    let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
    // SAFETY: `info` is writable for `size` bytes.
    let written = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDTBSDINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if written != size {
        return None;
    }
    // SAFETY: `proc_pidinfo` filled all `size` bytes.
    let info = unsafe { info.assume_init() };
    Some(info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec)
}

#[cfg(target_os = "linux")]
pub(super) fn start_time(pid: u32) -> Option<u64> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // `starttime` is field 22; the split starts at field 3, after the command name.
    stat.rsplit_once(')')?
        .1
        .split_whitespace()
        .nth(19)?
        .parse()
        .ok()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub(super) fn start_time(_pid: u32) -> Option<u64> {
    None
}

/// Whether one of `pid`'s arguments is exactly `daemon`.
#[cfg(target_os = "linux")]
pub(super) fn has_daemon_argument(pid: u32) -> bool {
    std::fs::read(format!("/proc/{pid}/cmdline"))
        .is_ok_and(|cmdline| cmdline.split(|&byte| byte == 0).any(|arg| arg == b"daemon"))
}

/// `KERN_PROCARGS2` is `argc`, the exec path, NUL padding, then `argv` and the
/// environment, each NUL-terminated.
#[cfg(target_os = "macos")]
pub(super) fn has_daemon_argument(pid: u32) -> bool {
    let mut argmax = [0u8; 4];
    if sysctl(&mut [libc::CTL_KERN, libc::KERN_ARGMAX], &mut argmax) != Some(4) {
        return false;
    }
    let mut args = vec![0u8; usize::try_from(i32::from_ne_bytes(argmax)).unwrap_or(0)];
    let mib = &mut [libc::CTL_KERN, libc::KERN_PROCARGS2, pid as libc::c_int];
    let Some(len) = sysctl(mib, &mut args).filter(|&len| len >= 4) else {
        return false;
    };
    let argc = i32::from_ne_bytes([args[0], args[1], args[2], args[3]]);
    args[4..len]
        .split(|&byte| byte == 0)
        .filter(|part| !part.is_empty())
        .skip(1)
        .take(usize::try_from(argc).unwrap_or(0))
        .any(|arg| arg == b"daemon")
}

/// Reads the value `mib` names into `out`; returns how many bytes it wrote.
#[cfg(target_os = "macos")]
fn sysctl(mib: &mut [libc::c_int], out: &mut [u8]) -> Option<usize> {
    let mut len = out.len();
    // SAFETY: `out` is writable for `len` bytes and `mib` holds `mib.len()` names.
    let status = unsafe {
        libc::sysctl(
            mib.as_mut_ptr(),
            mib.len() as libc::c_uint,
            out.as_mut_ptr().cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (status == 0).then_some(len)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub(super) fn has_daemon_argument(_pid: u32) -> bool {
    false
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use std::process::Command;
    use std::time::Duration;

    #[test]
    fn executable_names_a_live_process_and_nothing_once_it_is_reaped() {
        let own = executable(std::process::id()).unwrap();
        assert_eq!(
            own.file_name(),
            std::env::current_exe().unwrap().file_name()
        );
        let mut child = Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        assert_eq!(executable(pid), None);
        assert_eq!(start_time(pid), None);
    }

    #[test]
    fn the_start_time_is_stable_for_a_process() {
        let own = start_time(std::process::id());
        assert!(own.is_some());
        assert_eq!(start_time(std::process::id()), own);
    }

    #[test]
    fn only_a_process_run_with_a_daemon_argument_has_one() {
        assert!(!has_daemon_argument(std::process::id()));
        let mut child = Command::new("sh")
            .args(["-c", "sleep 5; exit 0", "daemon"])
            .spawn()
            .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let found = has_daemon_argument(child.id());
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(found);
    }
}
