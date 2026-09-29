//! Signals to processes the daemon started. Every kill goes through here and
//! the syscall, not the `kill` binary: procps `kill -9 -<pgid>` without `--`
//! signals the caller's own process group, which is the daemon's.

use libc::pid_t;

/// Whether `id`, as a pid or a process-group id, names neither init, every
/// process, this process, nor this process's own group.
///
/// @param id the pid or process-group id to check
/// @returns true when signalling `id` cannot reach this process or init
pub fn may_signal(id: u32) -> bool {
    let Ok(id) = pid_t::try_from(id) else {
        return false;
    };
    // SAFETY: `getpgrp` has no preconditions and cannot fail.
    let own_group = unsafe { libc::getpgrp() };
    id > 1 && u32::try_from(id).ok() != Some(std::process::id()) && id != own_group
}

/// Send `signal` to every process in group `pgid`.
///
/// @param pgid the process-group id, as returned for a child spawned with `process_group(0)`
/// @param signal the signal number, e.g. `libc::SIGKILL`
/// @returns true when the group was signalled; false when refused or it is gone
pub fn signal_group(pgid: u32, signal: libc::c_int) -> bool {
    // SAFETY: `killpg` only takes plain integers; `may_signal` bounds the group.
    may_signal(pgid) && unsafe { libc::killpg(pgid as pid_t, signal) } == 0
}

/// Send `signal` to the single process `pid`.
///
/// @param pid the process id
/// @param signal the signal number, e.g. `libc::SIGTERM`
/// @returns true when the process was signalled; false when refused or it is gone
pub fn signal_process(pid: u32, signal: libc::c_int) -> bool {
    // SAFETY: `kill` only takes plain integers; `may_signal` bounds the pid.
    may_signal(pid) && unsafe { libc::kill(pid as pid_t, signal) } == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::process::CommandExt;

    fn own_group() -> u32 {
        // SAFETY: `getpgrp` has no preconditions and cannot fail.
        u32::try_from(unsafe { libc::getpgrp() }).unwrap()
    }

    #[test]
    fn init_every_process_this_process_and_its_group_are_refused() {
        for id in [0, 1, std::process::id(), own_group(), u32::MAX] {
            assert!(!may_signal(id), "{id} must be refused");
        }
    }

    /// Signal 0 only checks existence, so a broken guard cannot harm the runner.
    #[test]
    fn the_signal_helpers_refuse_this_process_and_its_group() {
        assert!(!signal_group(own_group(), 0));
        assert!(!signal_process(std::process::id(), 0));
        assert!(!signal_process(own_group(), 0));
    }

    fn rust_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            if path.is_dir() {
                rust_files(&path, out);
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                out.push(path);
            }
        }
    }

    /// `kill` parses its arguments differently per platform and `pkill -f`
    /// matches any command line, the test runner's included.
    #[test]
    fn no_source_shells_out_to_a_kill_binary() {
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();
        rust_files(&src, &mut files);
        let needles: Vec<String> = ["kill", "pkill", "killall", "fuser"]
            .iter()
            .map(|binary| format!("Command::new(\"{binary}\")"))
            .collect();
        for file in files {
            let text = std::fs::read_to_string(&file).unwrap();
            for needle in &needles {
                assert!(
                    !text.contains(needle.as_str()),
                    "{} uses {needle}; signal through crate::signal instead",
                    file.display()
                );
            }
        }
    }

    #[test]
    fn a_child_group_with_a_multi_digit_id_is_killed() {
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .process_group(0)
            .spawn()
            .unwrap();
        let pgid = child.id();
        assert!(pgid > 9, "a multi-digit group is the case procps got wrong");
        assert!(signal_group(pgid, libc::SIGKILL));
        let status = child.wait().unwrap();
        assert_eq!(
            std::os::unix::process::ExitStatusExt::signal(&status),
            Some(libc::SIGKILL)
        );
    }
}
