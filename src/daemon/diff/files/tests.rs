use super::{create_file, delete_file, file_doc, rename_file, save_file, validate_relative_path};

struct Fixture {
    repo: tempfile::TempDir,
    outside: tempfile::TempDir,
}

impl Fixture {
    fn new() -> Self {
        Self {
            repo: tempfile::tempdir().unwrap(),
            outside: tempfile::tempdir().unwrap(),
        }
    }

    fn root(&self) -> String {
        self.repo.path().to_string_lossy().to_string()
    }

    /// A symlink inside the repo pointing at the sibling temp dir.
    fn escape_link(&self, name: &str) -> String {
        std::os::unix::fs::symlink(self.outside.path(), self.repo.path().join(name)).unwrap();
        name.to_string()
    }
}

#[test]
fn creates_a_file_and_a_directory_inside_the_root() {
    let fx = Fixture::new();
    create_file(&fx.root(), "src/main.rs", false).unwrap();
    create_file(&fx.root(), "docs/adr", true).unwrap();
    assert!(fx.repo.path().join("src/main.rs").is_file());
    assert!(fx.repo.path().join("docs/adr").is_dir());
}

#[test]
fn creating_the_same_file_twice_fails() {
    let fx = Fixture::new();
    create_file(&fx.root(), "a.txt", false).unwrap();
    assert!(create_file(&fx.root(), "a.txt", false).is_err());
}

#[test]
fn renames_inside_the_root_and_preserves_an_existing_target() {
    let fx = Fixture::new();
    std::fs::write(fx.repo.path().join("from.txt"), "new").unwrap();
    std::fs::write(fx.repo.path().join("onto.txt"), "old").unwrap();
    rename_file(&fx.root(), "from.txt", "nested/moved.txt").unwrap();
    assert!(fx.repo.path().join("nested/moved.txt").is_file());

    assert!(rename_file(&fx.root(), "nested/moved.txt", "onto.txt").is_err());
    let onto = std::fs::read_to_string(fx.repo.path().join("onto.txt")).unwrap();
    assert_eq!(onto, "old");
    assert_eq!(
        std::fs::read_to_string(fx.repo.path().join("nested/moved.txt")).unwrap(),
        "new"
    );
}

#[test]
fn rename_preserves_an_existing_dangling_symlink() {
    let fx = Fixture::new();
    std::fs::write(fx.repo.path().join("from.txt"), "source").unwrap();
    std::os::unix::fs::symlink("missing.txt", fx.repo.path().join("link.txt")).unwrap();
    assert!(rename_file(&fx.root(), "from.txt", "link.txt").is_err());
    assert!(fx.repo.path().join("from.txt").is_file());
    assert!(std::fs::symlink_metadata(fx.repo.path().join("link.txt"))
        .unwrap()
        .is_symlink());
}

#[test]
fn deletes_a_file_and_a_directory_tree() {
    let fx = Fixture::new();
    create_file(&fx.root(), "tree/a.txt", false).unwrap();
    delete_file(&fx.root(), "tree/a.txt").unwrap();
    assert!(!fx.repo.path().join("tree/a.txt").exists());

    delete_file(&fx.root(), "tree").unwrap();
    assert!(!fx.repo.path().join("tree").exists());
}

#[test]
fn a_relative_escape_is_refused() {
    let fx = Fixture::new();
    let outside = fx.outside.path().join("stolen.txt");
    std::fs::write(&outside, "keep").unwrap();
    let relative = format!(
        "../{}/stolen.txt",
        fx.outside.path().file_name().unwrap().to_string_lossy()
    );

    assert!(create_file(&fx.root(), &relative, false).is_err());
    assert!(rename_file(&fx.root(), &relative, "taken.txt").is_err());
    assert!(delete_file(&fx.root(), &relative).is_err());
    assert!(outside.is_file());
}

#[test]
fn an_absolute_path_is_refused() {
    let fx = Fixture::new();
    let absolute = fx.outside.path().join("stolen.txt");
    std::fs::write(&absolute, "keep").unwrap();
    let absolute = absolute.to_string_lossy().to_string();

    assert!(create_file(&fx.root(), &absolute, false).is_err());
    assert!(rename_file(&fx.root(), "a.txt", &absolute).is_err());
    assert!(delete_file(&fx.root(), &absolute).is_err());
}

#[test]
fn a_symlinked_parent_that_leaves_the_root_is_refused() {
    let fx = Fixture::new();
    let link = fx.escape_link("escape");
    let outside = fx.outside.path().join("stolen.txt");
    std::fs::write(&outside, "keep").unwrap();
    let through_link = format!("{link}/stolen.txt");

    assert!(create_file(&fx.root(), &format!("{link}/new.txt"), false).is_err());
    assert!(rename_file(&fx.root(), &through_link, "taken.txt").is_err());
    assert!(delete_file(&fx.root(), &through_link).is_err());
    assert!(outside.is_file());
    assert!(!fx.outside.path().join("new.txt").exists());
}

#[test]
fn only_plain_components_pass_validation() {
    for path in ["a.txt", "src/main.rs", "./src/main.rs", "a//b"] {
        assert!(validate_relative_path(path).is_ok(), "{path}");
    }
    for path in ["", "/etc/passwd", "../x", "a/../../x", "a/.."] {
        assert!(validate_relative_path(path).is_err(), "{path}");
    }
}

#[test]
fn an_empty_path_is_refused() {
    let fx = Fixture::new();
    assert!(create_file(&fx.root(), "", false).is_err());
    assert!(rename_file(&fx.root(), "", "a.txt").is_err());
    assert!(delete_file(&fx.root(), "").is_err());
}

#[tokio::test]
async fn file_doc_reads_a_relative_path() {
    let fx = Fixture::new();
    std::fs::write(fx.repo.path().join("notes.txt"), "hello").unwrap();
    let doc = file_doc(&fx.root(), "notes.txt").await.unwrap();
    assert_eq!(doc.new_text, "hello");
}

#[tokio::test]
async fn file_doc_refuses_paths_outside_the_root() {
    let fx = Fixture::new();
    let secret = fx.outside.path().join("secret.png");
    std::fs::write(&secret, "keep").unwrap();
    let dir = fx.outside.path().file_name().unwrap().to_string_lossy();
    let link = fx.escape_link("escape");
    std::os::unix::fs::symlink(&secret, fx.repo.path().join("leak.png")).unwrap();

    for path in [
        secret.to_string_lossy().to_string(),
        format!("../{dir}/secret.png"),
        format!("{link}/secret.png"),
        "leak.png".to_string(),
    ] {
        assert!(file_doc(&fx.root(), &path).await.is_err(), "{path}");
    }
}

#[test]
fn save_file_does_not_write_through_a_link_that_leaves_the_root() {
    let fx = Fixture::new();
    let outside = fx.outside.path().join("target.txt");
    std::fs::write(&outside, "keep").unwrap();
    std::os::unix::fs::symlink(&outside, fx.repo.path().join("link.txt")).unwrap();

    assert!(save_file(&fx.root(), "link.txt", "overwritten").is_err());
    assert!(save_file(&fx.root(), &outside.to_string_lossy(), "overwritten").is_err());
    assert_eq!(std::fs::read_to_string(&outside).unwrap(), "keep");
    save_file(&fx.root(), "kept/inside.txt", "ok").unwrap();
}

#[tokio::test]
async fn non_text_files_are_never_opened_as_empty_editable_documents() {
    let fx = Fixture::new();
    for (name, bytes) in [
        ("invalid-utf8.dat", vec![b'a', 0xff, b'b']),
        ("binary.dat", vec![b'a', 0, b'b']),
    ] {
        std::fs::write(fx.repo.path().join(name), &bytes).unwrap();
        let error = file_doc(&fx.root(), name).await.unwrap_err().to_string();
        assert!(error.contains("cannot be edited as text"), "{error}");
        assert!(save_file(&fx.root(), name, "").is_err());
        assert_eq!(std::fs::read(fx.repo.path().join(name)).unwrap(), bytes);
    }
}

#[tokio::test]
async fn images_keep_their_binary_preview_without_enabling_text_overwrites() {
    let fx = Fixture::new();
    let bytes = [0x89, b'P', b'N', b'G', 0, 0xff];
    std::fs::write(fx.repo.path().join("preview.png"), bytes).unwrap();
    let doc = file_doc(&fx.root(), "preview.png").await.unwrap();
    assert_eq!(doc.new_data_base64.as_deref(), Some("iVBORwD/"));
    assert!(save_file(&fx.root(), "preview.png", "").is_err());
    assert_eq!(
        std::fs::read(fx.repo.path().join("preview.png")).unwrap(),
        bytes
    );
}

#[tokio::test]
async fn saving_a_stale_text_editor_cannot_overwrite_a_new_binary_file() {
    let fx = Fixture::new();
    std::fs::write(fx.repo.path().join("changing.txt"), "opened as text").unwrap();
    assert_eq!(
        file_doc(&fx.root(), "changing.txt").await.unwrap().new_text,
        "opened as text"
    );
    let binary = [0, 0xff, 0xfe, b'x'];
    std::fs::write(fx.repo.path().join("changing.txt"), binary).unwrap();
    assert!(save_file(&fx.root(), "changing.txt", "editor text").is_err());
    assert_eq!(
        std::fs::read(fx.repo.path().join("changing.txt")).unwrap(),
        binary
    );
}

#[test]
fn text_saves_accept_unicode_and_empty_files_but_refuse_binary_content() {
    let fx = Fixture::new();
    save_file(&fx.root(), "unicode.txt", "Hello, 世界\n").unwrap();
    save_file(&fx.root(), "empty.txt", "").unwrap();
    assert!(save_file(&fx.root(), "bad.txt", "text\0binary").is_err());
    assert!(!fx.repo.path().join("bad.txt").exists());
    assert_eq!(
        std::fs::read_to_string(fx.repo.path().join("unicode.txt")).unwrap(),
        "Hello, 世界\n"
    );
}
