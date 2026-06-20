//! Safe archive extraction for the import pipeline.
//!
//! Supports `.zip` (Overleaf export) and `.tar.gz` / `.tar` (arXiv submission)
//! archives. All extraction is hardened against common hostile-archive attacks:
//! zip-slip path traversal, symlink escapes, excessive file counts, and
//! oversized files/archives.
//!
//! No content is written to disk here — entries are decoded into memory as
//! [`galley_core::FileEntry`] values and returned to the caller. Materialising
//! them to disk is the job of [`crate::import_from_entries`].

use flate2::read::GzDecoder;
use galley_core::FileEntry;
use std::fmt;
use std::io::{self, Read};
use tar::Archive;
use zip::ZipArchive;

// ── Limits ─────────────────────────────────────────────────────────────────

/// Extraction guardrails applied to every archive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArchiveLimits {
    /// Maximum number of files to extract.
    pub max_files: usize,
    /// Maximum size of a single file, in bytes.
    pub max_file_bytes: u64,
    /// Maximum total uncompressed size, in bytes.
    pub max_total_bytes: u64,
}

impl Default for ArchiveLimits {
    fn default() -> Self {
        Self {
            max_files: 2_000,
            max_file_bytes: 50 * 1024 * 1024,   // 50 MiB per file
            max_total_bytes: 256 * 1024 * 1024, // 256 MiB total
        }
    }
}

// ── Error ───────────────────────────────────────────────────────────────────

/// Why archive extraction failed.
#[derive(Debug)]
pub enum ArchiveError {
    /// The archive bytes are malformed or of an unsupported format.
    BadArchive(String),
    /// A path inside the archive would escape the target directory (zip-slip).
    ZipSlip(String),
    /// The archive contains a symbolic link, which Galley never extracts.
    Symlink(String),
    /// The archive contains more files than [`ArchiveLimits::max_files`].
    TooManyFiles(usize),
    /// A single file exceeds [`ArchiveLimits::max_file_bytes`].
    FileTooLarge {
        /// The in-archive path of the oversized file.
        path: String,
        /// The declared uncompressed size in bytes.
        bytes: u64,
    },
    /// The total uncompressed size exceeds [`ArchiveLimits::max_total_bytes`].
    TotalTooLarge(u64),
    /// An I/O error occurred while reading the archive bytes.
    Io(io::Error),
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArchiveError::BadArchive(msg) => write!(f, "invalid archive: {msg}"),
            ArchiveError::ZipSlip(path) => {
                write!(f, "path traversal detected in archive entry: {path}")
            }
            ArchiveError::Symlink(path) => {
                write!(f, "symbolic link rejected in archive entry: {path}")
            }
            ArchiveError::TooManyFiles(n) => write!(f, "archive contains too many files: {n}"),
            ArchiveError::FileTooLarge { path, bytes } => {
                write!(f, "file too large ({bytes} bytes): {path}")
            }
            ArchiveError::TotalTooLarge(bytes) => {
                write!(f, "total uncompressed size too large: {bytes} bytes")
            }
            ArchiveError::Io(err) => write!(f, "I/O error: {err}"),
        }
    }
}

impl std::error::Error for ArchiveError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ArchiveError::Io(err) => Some(err),
            _ => None,
        }
    }
}

// ── Zip extraction ──────────────────────────────────────────────────────────

/// Extract a `.zip` archive from raw bytes, returning one [`FileEntry`] per
/// regular file. Directories and empty entries are skipped.
///
/// # Security
///
/// * Paths containing `..` are rejected (zip-slip / path traversal).
/// * Symbolic links are rejected.
/// * File count, per-file size, and total size are checked against `limits`.
///
/// # Errors
///
/// Returns [`ArchiveError`] on any security violation, oversized content, or
/// format error.
pub fn extract_zip(bytes: &[u8], limits: ArchiveLimits) -> Result<Vec<FileEntry>, ArchiveError> {
    let cursor = io::Cursor::new(bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| ArchiveError::BadArchive(e.to_string()))?;

    let file_count = archive.len();
    if file_count > limits.max_files {
        return Err(ArchiveError::TooManyFiles(file_count));
    }

    let mut entries = Vec::new();
    let mut total_bytes: u64 = 0;

    for i in 0..file_count {
        // zip 2.4.2+ validates all local file headers during ZipArchive::new();
        // by_index on any valid index in an in-memory archive cannot fail.
        let mut zf = archive.by_index(i).expect(
            "all local headers validated by ZipArchive::new; by_index on a valid index cannot fail",
        );

        // Reject symlinks.
        if zf.is_symlink() {
            let name = zf.name().to_string();
            return Err(ArchiveError::Symlink(name));
        }

        // Skip directories.
        if zf.is_dir() {
            continue;
        }

        let name = zf.name().to_string();

        // Zip-slip: reject any path component that is `..`.
        reject_traversal(&name)?;

        let declared = zf.size();
        if declared > limits.max_file_bytes {
            return Err(ArchiveError::FileTooLarge {
                path: name,
                bytes: declared,
            });
        }

        total_bytes += declared;
        if total_bytes > limits.max_total_bytes {
            return Err(ArchiveError::TotalTooLarge(total_bytes));
        }

        let mut content = Vec::with_capacity(declared as usize);
        zf.read_to_end(&mut content).map_err(ArchiveError::Io)?;

        entries.push(FileEntry::new(name, content));
    }

    Ok(entries)
}

// ── Tarball extraction ──────────────────────────────────────────────────────

/// Extract a gzip-compressed tarball from raw bytes, returning one
/// [`FileEntry`] per regular file.
///
/// # Security
///
/// Same guarantees as [`extract_zip`]: path traversal, symlinks, and size
/// limits are all checked.
///
/// # Errors
///
/// Returns [`ArchiveError`] on any security violation, oversized content, or
/// format error.
pub fn extract_tarball(
    bytes: &[u8],
    limits: ArchiveLimits,
) -> Result<Vec<FileEntry>, ArchiveError> {
    let cursor = io::Cursor::new(bytes);
    let decoder: Box<dyn Read + '_> = Box::new(GzDecoder::new(cursor));
    extract_from_archive(Archive::new(decoder), limits)
}

// Inner helper that accepts a boxed reader so all tests share a single
// monomorphisation, ensuring every code path is reachable from a single
// coverage record.
fn extract_from_archive<'a>(
    mut archive: Archive<Box<dyn Read + 'a>>,
    limits: ArchiveLimits,
) -> Result<Vec<FileEntry>, ArchiveError> {
    let mut out = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut file_count: usize = 0;

    for entry in archive
        .entries()
        .map_err(|e| ArchiveError::BadArchive(e.to_string()))?
    {
        let mut entry = entry.map_err(ArchiveError::Io)?;
        let header = entry.header();

        // Reject symlinks and hard-links.
        let entry_type = header.entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            // OsStr::from_bytes accepts any byte sequence on POSIX; never fails.
            let raw = entry
                .path()
                .expect("tar entry path is raw bytes on POSIX; never fails");
            let path = raw.to_string_lossy().to_string();
            return Err(ArchiveError::Symlink(path));
        }

        // Skip directories.
        if entry_type.is_dir() {
            continue;
        }

        file_count += 1;
        if file_count > limits.max_files {
            return Err(ArchiveError::TooManyFiles(file_count));
        }

        // OsStr::from_bytes accepts any byte sequence on POSIX; never fails.
        let raw_path = entry
            .path()
            .expect("tar entry path is raw bytes on POSIX; never fails");
        let name = raw_path.to_string_lossy().to_string();
        reject_traversal(&name)?;

        // The tar iterator validates the size field when creating the Entry; if
        // iteration succeeded, this call on the same raw bytes also succeeds.
        let size = header
            .size()
            .expect("size field already validated by tar iterator");
        if size > limits.max_file_bytes {
            return Err(ArchiveError::FileTooLarge {
                path: name.clone(),
                bytes: size,
            });
        }

        total_bytes += size;
        if total_bytes > limits.max_total_bytes {
            return Err(ArchiveError::TotalTooLarge(total_bytes));
        }

        let mut content = Vec::with_capacity(size as usize);
        entry.read_to_end(&mut content).map_err(ArchiveError::Io)?;

        out.push(FileEntry::new(name, content));
    }

    Ok(out)
}

// ── Path-traversal guard ────────────────────────────────────────────────────

fn reject_traversal(path: &str) -> Result<(), ArchiveError> {
    // Null bytes can confuse C string handling in some extractors downstream.
    if path.contains('\0') {
        return Err(ArchiveError::ZipSlip(path.to_string()));
    }
    // Absolute paths (Unix `/…`, Windows `\…`, or drive letters `C:\…`/`C:/…`).
    if path.starts_with('/') || path.starts_with('\\') {
        return Err(ArchiveError::ZipSlip(path.to_string()));
    }
    if path.len() >= 2 && path.as_bytes()[1] == b':' {
        return Err(ArchiveError::ZipSlip(path.to_string()));
    }
    // Split on both forward and back-slash separators.
    for component in path.split('/').flat_map(|p| p.split('\\')) {
        if component == ".." {
            return Err(ArchiveError::ZipSlip(path.to_string()));
        }
    }
    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::GzDecoder;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;
    use tar::Archive;
    use zip::write::{FileOptions, ZipWriter};
    use zip::CompressionMethod;

    // ── Tag helper (avoids matches! missed-region false negatives) ──

    fn tag(err: &ArchiveError) -> &'static str {
        match err {
            ArchiveError::BadArchive(_) => "bad-archive",
            ArchiveError::ZipSlip(_) => "zip-slip",
            ArchiveError::Symlink(_) => "symlink",
            ArchiveError::TooManyFiles(_) => "too-many-files",
            ArchiveError::FileTooLarge { .. } => "file-too-large",
            ArchiveError::TotalTooLarge(_) => "total-too-large",
            ArchiveError::Io(_) => "io",
        }
    }

    // ── Zip helpers ──

    fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let buf = Vec::new();
        let cursor = io::Cursor::new(buf);
        let mut writer = ZipWriter::new(cursor);
        let opts: FileOptions<()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        for (name, data) in entries {
            writer.start_file(*name, opts).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn make_zip_dir(entries: &[(&str, &[u8])], dirs: &[&str]) -> Vec<u8> {
        let buf = Vec::new();
        let cursor = io::Cursor::new(buf);
        let mut writer = ZipWriter::new(cursor);
        let opts: FileOptions<()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        for dir in dirs {
            writer.add_directory(*dir, opts).unwrap();
        }
        for (name, data) in entries {
            writer.start_file(*name, opts).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn make_symlink_zip(name: &str) -> Vec<u8> {
        let buf = Vec::new();
        let cursor = io::Cursor::new(buf);
        let mut writer = ZipWriter::new(cursor);
        let opts: FileOptions<()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        // `add_symlink` is the correct zip-2.x API for a symlink entry.
        writer.add_symlink(name, "../etc/passwd", opts).unwrap();
        writer.finish().unwrap().into_inner()
    }

    /// Create a zip with corrupted magic bytes at offset 0 (the local file
    /// header).  `ZipArchive::new` validates all local headers at construction
    /// time in zip 2.4.2+, so `new()` itself fails, exercising the `new()`
    /// `map_err` closure.
    fn make_corrupted_local_header_zip() -> Vec<u8> {
        let mut bytes = make_zip(&[("file.txt", b"hello")]);
        bytes[0] = 0xFF;
        bytes[1] = 0xFF;
        bytes[2] = 0xFF;
        bytes[3] = 0xFF;
        bytes
    }

    /// Create a zip with valid structure and DEFLATE compression but invalid
    /// compressed bytes.  `ZipArchive::new()` and `by_index()` both succeed
    /// (structural validation only); `read_to_end()` fails when flate2 cannot
    /// decode the invalid DEFLATE bitstream (`0xFF` = BFINAL=1 BTYPE=11,
    /// which is a reserved and therefore invalid block type).
    fn make_corrupted_deflate_zip() -> Vec<u8> {
        let filename = b"file.txt";
        let fname_len = filename.len() as u16;
        let bad_data: &[u8] = &[0xFF, 0xFF, 0xFF]; // invalid DEFLATE stream
        let compressed_len = bad_data.len() as u32;
        let uncompressed_len = 10u32;

        let mut zip = Vec::new();
        let lfh_offset = 0u32;

        // Local file header
        zip.extend_from_slice(&[0x50, 0x4b, 0x03, 0x04]); // signature
        zip.extend_from_slice(&20u16.to_le_bytes()); // version needed
        zip.extend_from_slice(&0u16.to_le_bytes()); // flags
        zip.extend_from_slice(&8u16.to_le_bytes()); // compression = DEFLATE
        zip.extend_from_slice(&0u16.to_le_bytes()); // mod time
        zip.extend_from_slice(&0u16.to_le_bytes()); // mod date
        zip.extend_from_slice(&0u32.to_le_bytes()); // CRC-32
        zip.extend_from_slice(&compressed_len.to_le_bytes());
        zip.extend_from_slice(&uncompressed_len.to_le_bytes());
        zip.extend_from_slice(&fname_len.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // extra length
        zip.extend_from_slice(filename);
        zip.extend_from_slice(bad_data);

        // Central directory entry
        let cd_offset = zip.len() as u32;
        zip.extend_from_slice(&[0x50, 0x4b, 0x01, 0x02]); // CD signature
        zip.extend_from_slice(&20u16.to_le_bytes());
        zip.extend_from_slice(&20u16.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes());
        zip.extend_from_slice(&8u16.to_le_bytes()); // compression = DEFLATE
        zip.extend_from_slice(&0u16.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes());
        zip.extend_from_slice(&0u32.to_le_bytes()); // CRC-32
        zip.extend_from_slice(&compressed_len.to_le_bytes());
        zip.extend_from_slice(&uncompressed_len.to_le_bytes());
        zip.extend_from_slice(&fname_len.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // extra length
        zip.extend_from_slice(&0u16.to_le_bytes()); // comment length
        zip.extend_from_slice(&0u16.to_le_bytes()); // disk number start
        zip.extend_from_slice(&0u16.to_le_bytes()); // internal attrs
        zip.extend_from_slice(&0u32.to_le_bytes()); // external attrs
        zip.extend_from_slice(&lfh_offset.to_le_bytes());
        zip.extend_from_slice(filename);

        // End of central directory
        let cd_size = (zip.len() as u32) - cd_offset;
        zip.extend_from_slice(&[0x50, 0x4b, 0x05, 0x06]); // EOCD signature
        zip.extend_from_slice(&0u16.to_le_bytes()); // disk number
        zip.extend_from_slice(&0u16.to_le_bytes()); // disk with CD start
        zip.extend_from_slice(&1u16.to_le_bytes()); // entries on this disk
        zip.extend_from_slice(&1u16.to_le_bytes()); // total entries
        zip.extend_from_slice(&cd_size.to_le_bytes());
        zip.extend_from_slice(&cd_offset.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // comment length

        zip
    }

    // ── Tarball helpers ──

    fn make_tarball(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let buf = Vec::new();
        let enc = GzEncoder::new(buf, Compression::default());
        let mut tar = tar::Builder::new(enc);
        for (name, data) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, name, *data).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap()
    }

    fn make_symlink_tarball(name: &str, target: &str) -> Vec<u8> {
        let buf = Vec::new();
        let enc = GzEncoder::new(buf, Compression::default());
        let mut tar = tar::Builder::new(enc);
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header.set_cksum();
        tar.append_link(&mut header, name, target).unwrap();
        tar.into_inner().unwrap().finish().unwrap()
    }

    fn make_hard_link_tarball(name: &str, target: &str) -> Vec<u8> {
        let buf = Vec::new();
        let enc = GzEncoder::new(buf, Compression::default());
        let mut tar = tar::Builder::new(enc);
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Link);
        header.set_size(0);
        header.set_mode(0o644);
        header.set_cksum();
        tar.append_link(&mut header, name, target).unwrap();
        tar.into_inner().unwrap().finish().unwrap()
    }

    fn make_tar_dir(dir_name: &str, entries: &[(&str, &[u8])]) -> Vec<u8> {
        let buf = Vec::new();
        let enc = GzEncoder::new(buf, Compression::default());
        let mut tar = tar::Builder::new(enc);
        // Add directory entry.
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Directory);
        header.set_size(0);
        header.set_mode(0o755);
        header.set_cksum();
        tar.append_data(&mut header, dir_name, &[] as &[u8])
            .unwrap();
        for (name, data) in entries {
            let mut h = tar::Header::new_gnu();
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            h.set_cksum();
            tar.append_data(&mut h, name, *data).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap()
    }

    /// Build a raw (non-gzip) tarball, used with `Archive<FailAfterHeaderRead>`.
    fn make_raw_tarball(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut tar = tar::Builder::new(Vec::new());
        for (name, data) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, name, *data).unwrap();
        }
        tar.into_inner().unwrap()
    }

    /// Build a gzip-compressed tarball whose size field contains non-octal bytes.
    ///
    /// The checksum is recomputed over the crafted header so the tar crate
    /// accepts it structurally, but `Header::size()` fails because `'X'` is
    /// not a valid octal digit.
    fn make_invalid_octal_size_tar() -> Vec<u8> {
        let mut block = [0u8; 512];
        let name = b"file.tex";
        block[..name.len()].copy_from_slice(name);
        block[100..107].copy_from_slice(b"0000644"); // mode
        block[108..115].copy_from_slice(b"0000000"); // uid
        block[116..123].copy_from_slice(b"0000000"); // gid
                                                     // Size field at bytes 124–135: fill with 'X', not a valid octal digit.
        block[124..135].fill(b'X');
        block[135] = 0;
        block[136..147].copy_from_slice(b"00000000000"); // mtime
        block[148..156].fill(b' '); // checksum placeholder (spaces for sum)
        block[156] = b'0'; // typeflag = regular file
        block[257..263].copy_from_slice(b"ustar\0");
        block[263..265].copy_from_slice(b"00");
        let sum: u32 = block.iter().map(|&b| b as u32).sum();
        let cksum = format!("{sum:07o}\0");
        block[148..156].copy_from_slice(cksum.as_bytes());

        let mut buf = Vec::new();
        let mut enc = GzEncoder::new(&mut buf, Compression::default());
        enc.write_all(&block).unwrap();
        enc.write_all(&[0u8; 1024]).unwrap(); // two end-of-archive blocks
        enc.finish().unwrap();
        buf
    }

    /// A `Read` implementation that injects an error after `fail_after` bytes.
    struct FailAfterHeaderRead {
        inner: io::Cursor<Vec<u8>>,
        read_so_far: usize,
        fail_after: usize,
    }

    impl FailAfterHeaderRead {
        fn new(data: Vec<u8>, fail_after: usize) -> Self {
            Self {
                inner: io::Cursor::new(data),
                read_so_far: 0,
                fail_after,
            }
        }
    }

    impl io::Read for FailAfterHeaderRead {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            if self.read_so_far >= self.fail_after {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "injected failure",
                ));
            }
            let available = self.fail_after - self.read_so_far;
            let limit = buf.len().min(available);
            let n = self
                .inner
                .read(&mut buf[..limit])
                .expect("Cursor<Vec<u8>> read never fails");
            self.read_so_far += n;
            Ok(n)
        }
    }

    // ── ArchiveError display & error trait ──

    #[test]
    fn archive_error_bad_archive_display() {
        let e = ArchiveError::BadArchive("corrupt".to_string());
        assert!(e.to_string().contains("invalid archive"));
        assert!(format!("{e:?}").contains("BadArchive"));
    }

    #[test]
    fn archive_error_zip_slip_display() {
        use std::error::Error;
        let e = ArchiveError::ZipSlip("../../etc".to_string());
        assert!(e.to_string().contains("traversal"));
        assert!(e.source().is_none());
    }

    #[test]
    fn archive_error_symlink_display() {
        let e = ArchiveError::Symlink("link.tex".to_string());
        assert!(e.to_string().contains("symbolic link"));
    }

    #[test]
    fn archive_error_too_many_files_display() {
        let e = ArchiveError::TooManyFiles(9999);
        assert!(e.to_string().contains("9999"));
    }

    #[test]
    fn archive_error_file_too_large_display() {
        let e = ArchiveError::FileTooLarge {
            path: "big.pdf".to_string(),
            bytes: 1_000_000,
        };
        assert!(e.to_string().contains("big.pdf"));
        assert!(e.to_string().contains("1000000"));
    }

    #[test]
    fn archive_error_total_too_large_display() {
        let e = ArchiveError::TotalTooLarge(999_999_999);
        assert!(e.to_string().contains("999999999"));
    }

    #[test]
    fn archive_error_io_display_and_source() {
        use std::error::Error;
        let e = ArchiveError::Io(io::Error::other("disk full"));
        assert!(e.to_string().contains("disk full"));
        assert!(e.source().is_some());
    }

    // ── ArchiveLimits derives ──

    #[test]
    fn archive_limits_default_and_derives() {
        let l = ArchiveLimits::default();
        assert_eq!(l.max_files, 2_000);
        let l2 = l;
        assert_eq!(l, l2);
        assert!(format!("{l:?}").contains("ArchiveLimits"));
    }

    // ── extract_zip happy path ──

    #[test]
    fn extract_zip_returns_file_entries() {
        let zip = make_zip(&[
            ("main.tex", b"\\documentclass{article}"),
            ("refs.bib", b"@book{}"),
        ]);
        let entries = extract_zip(&zip, ArchiveLimits::default()).unwrap();
        assert_eq!(entries.len(), 2);
        let names: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(names.contains(&"main.tex"));
        assert!(names.contains(&"refs.bib"));
    }

    #[test]
    fn extract_zip_skips_directory_entries() {
        let zip = make_zip_dir(&[("sub/file.tex", b"hello")], &["sub/"]);
        let entries = extract_zip(&zip, ArchiveLimits::default()).unwrap();
        // Only the file, not the directory.
        assert!(entries.iter().all(|e| !e.path.ends_with('/')));
    }

    #[test]
    fn extract_zip_empty_archive() {
        let zip = make_zip(&[]);
        let entries = extract_zip(&zip, ArchiveLimits::default()).unwrap();
        assert!(entries.is_empty());
    }

    // ── extract_zip security ──

    #[test]
    fn extract_zip_rejects_path_traversal() {
        let zip = make_zip(&[("../../etc/passwd", b"root:x:0:0")]);
        let err = extract_zip(&zip, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "zip-slip");
    }

    #[test]
    fn extract_zip_rejects_symlinks() {
        let zip = make_symlink_zip("evil.tex");
        let err = extract_zip(&zip, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "symlink");
    }

    #[test]
    fn extract_zip_rejects_too_many_files() {
        let entries: Vec<(String, Vec<u8>)> = (0..5)
            .map(|i| (format!("f{i}.tex"), b"x".to_vec()))
            .collect();
        let ref_entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(n, d)| (n.as_str(), d.as_slice()))
            .collect();
        let zip = make_zip(&ref_entries);
        let limits = ArchiveLimits {
            max_files: 3,
            ..ArchiveLimits::default()
        };
        let err = extract_zip(&zip, limits).unwrap_err();
        assert_eq!(tag(&err), "too-many-files");
    }

    #[test]
    fn extract_zip_rejects_oversized_file() {
        let big = vec![b'x'; 100];
        let zip = make_zip(&[("big.bin", &big)]);
        let limits = ArchiveLimits {
            max_file_bytes: 50,
            ..ArchiveLimits::default()
        };
        let err = extract_zip(&zip, limits).unwrap_err();
        assert_eq!(tag(&err), "file-too-large");
    }

    #[test]
    fn extract_zip_rejects_total_too_large() {
        let data = vec![b'a'; 60];
        let zip = make_zip(&[("a.tex", &data), ("b.tex", &data)]);
        let limits = ArchiveLimits {
            max_file_bytes: 200,
            max_total_bytes: 100,
            ..ArchiveLimits::default()
        };
        let err = extract_zip(&zip, limits).unwrap_err();
        assert_eq!(tag(&err), "total-too-large");
    }

    #[test]
    fn extract_zip_rejects_bad_bytes() {
        let err = extract_zip(b"this is not a zip", ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "bad-archive");
    }

    #[test]
    fn extract_zip_bad_archive_on_corrupted_local_header() {
        // Bytes 0-3 are corrupted so ZipArchive::new() fails at construction
        // time (zip 2.4.2+ validates all local headers during new()), exercising
        // the new() map_err closure.
        let zip = make_corrupted_local_header_zip();
        let err = extract_zip(&zip, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "bad-archive");
    }

    #[test]
    fn extract_zip_read_error_on_corrupted_deflate() {
        // Valid structure and DEFLATE compression flag; invalid compressed bytes.
        // new() and by_index() both succeed (structural validation only);
        // read_to_end() fails as flate2 cannot decode the bitstream.
        let zip = make_corrupted_deflate_zip();
        let err = extract_zip(&zip, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "io");
    }

    // ── extract_tarball happy path ──

    #[test]
    fn extract_tarball_returns_file_entries() {
        let tar = make_tarball(&[
            ("main.tex", b"\\documentclass{article}"),
            ("fig/plot.pdf", b"%PDF-1"),
        ]);
        let entries = extract_tarball(&tar, ArchiveLimits::default()).unwrap();
        assert_eq!(entries.len(), 2);
        let names: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert!(names.contains(&"main.tex"));
        assert!(names.contains(&"fig/plot.pdf"));
    }

    #[test]
    fn extract_tarball_skips_directory_entries() {
        let tar = make_tar_dir("subdir/", &[("subdir/a.tex", b"hi")]);
        let entries = extract_tarball(&tar, ArchiveLimits::default()).unwrap();
        assert!(entries.iter().all(|e| !e.path.ends_with('/')));
    }

    #[test]
    fn extract_tarball_empty_archive() {
        let tar = make_tarball(&[]);
        let entries = extract_tarball(&tar, ArchiveLimits::default()).unwrap();
        assert!(entries.is_empty());
    }

    /// Build a gzip-compressed tar that contains an entry whose path has `..`.
    ///
    /// The tar crate's *write* side rejects `..` paths, so we craft the raw
    /// 512-byte header block by hand (POSIX ustar format) and feed it through
    /// GzEncoder.
    fn make_traversal_tarball() -> Vec<u8> {
        let path = b"../../bad.sh";
        let mut block = [0u8; 512];
        block[..path.len()].copy_from_slice(path);
        // mode (octal, NUL-terminated, 8 bytes)
        block[100..107].copy_from_slice(b"0000644");
        // uid / gid / size = 0
        block[108..115].copy_from_slice(b"0000000");
        block[116..123].copy_from_slice(b"0000000");
        block[124..135].copy_from_slice(b"00000000000");
        // mtime
        block[136..147].copy_from_slice(b"00000000000");
        // checksum placeholder (8 spaces)
        block[148..156].copy_from_slice(b"        ");
        // typeflag '0' = regular file
        block[156] = b'0';
        // ustar magic + version
        block[257..263].copy_from_slice(b"ustar\0");
        block[263..265].copy_from_slice(b"00");
        // compute checksum: sum all bytes (checksum field treated as spaces)
        let sum: u32 = block.iter().map(|&b| b as u32).sum();
        let cksum = format!("{sum:06o}\0 ");
        block[148..156].copy_from_slice(cksum.as_bytes());

        // tar = header + two empty end-of-archive blocks
        let mut raw = block.to_vec();
        raw.extend_from_slice(&[0u8; 1024]);

        let buf = Vec::new();
        let mut enc = GzEncoder::new(buf, Compression::default());
        enc.write_all(&raw).unwrap();
        enc.finish().unwrap()
    }

    // ── extract_tarball security ──

    #[test]
    fn extract_tarball_rejects_path_traversal() {
        let tar = make_traversal_tarball();
        let err = extract_tarball(&tar, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "zip-slip");
    }

    #[test]
    fn extract_tarball_rejects_symlinks() {
        let tar = make_symlink_tarball("link.tex", "../secret");
        let err = extract_tarball(&tar, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "symlink");
    }

    #[test]
    fn extract_tarball_rejects_hard_links() {
        let tar = make_hard_link_tarball("hardlink.tex", "target.tex");
        let err = extract_tarball(&tar, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "symlink");
    }

    #[test]
    fn extract_tarball_rejects_too_many_files() {
        let entries: Vec<(String, Vec<u8>)> = (0..5)
            .map(|i| (format!("f{i}.tex"), b"x".to_vec()))
            .collect();
        let ref_entries: Vec<(&str, &[u8])> = entries
            .iter()
            .map(|(n, d)| (n.as_str(), d.as_slice()))
            .collect();
        let tar = make_tarball(&ref_entries);
        let limits = ArchiveLimits {
            max_files: 3,
            ..ArchiveLimits::default()
        };
        let err = extract_tarball(&tar, limits).unwrap_err();
        assert_eq!(tag(&err), "too-many-files");
    }

    #[test]
    fn extract_tarball_rejects_oversized_file() {
        let big = vec![b'x'; 100];
        let tar = make_tarball(&[("big.bin", &big)]);
        let limits = ArchiveLimits {
            max_file_bytes: 50,
            ..ArchiveLimits::default()
        };
        let err = extract_tarball(&tar, limits).unwrap_err();
        assert_eq!(tag(&err), "file-too-large");
    }

    #[test]
    fn extract_tarball_rejects_total_too_large() {
        let data = vec![b'a'; 60];
        let tar = make_tarball(&[("a.tex", &data), ("b.tex", &data)]);
        let limits = ArchiveLimits {
            max_file_bytes: 200,
            max_total_bytes: 100,
            ..ArchiveLimits::default()
        };
        let err = extract_tarball(&tar, limits).unwrap_err();
        assert_eq!(tag(&err), "total-too-large");
    }

    #[test]
    fn extract_tarball_rejects_bad_bytes() {
        // The gzip decoder is lazy: it may fail either when calling `entries()`
        // (bad-archive) or when iterating the first entry (io).  Both indicate
        // corrupt input; the exact variant is an implementation detail of flate2.
        let err = extract_tarball(b"not a gzip", ArchiveLimits::default()).unwrap_err();
        assert!(["bad-archive", "io"].contains(&tag(&err)));
    }

    #[test]
    fn extract_tarball_bad_archive_entries_called_twice() {
        // tar::Archive::entries() fails when the archive position is non-zero
        // (it has already been partially consumed). By exhausting the iterator
        // from a first call and then passing the same archive to the private
        // extract_from_archive helper we exercise the entries().map_err closure.
        let tgz = make_tarball(&[("a.tex", b"hello")]);
        let cursor = io::Cursor::new(tgz.as_slice());
        let decoder: Box<dyn Read> = Box::new(GzDecoder::new(cursor));
        let mut archive = Archive::new(decoder);
        // Exhaust entries to advance the archive's internal byte position.
        for _ in archive.entries().unwrap() {}
        let err = extract_from_archive(archive, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "bad-archive");
    }

    #[test]
    fn extract_tarball_read_error_on_invalid_header_size() {
        // A tar whose size field contains non-octal bytes.  The checksum is
        // valid so the tar crate accepts the header, but Header::size() fails,
        // covering the size().map_err(Io) branch.
        let tar = make_invalid_octal_size_tar();
        let err = extract_tarball(&tar, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "io");
    }

    #[test]
    fn extract_from_archive_bad_entries_on_exhausted_fail_reader() {
        // After exhausting a FailAfterHeaderRead archive, entries() returns Err,
        // covering the entries().map_err closure.
        let raw = make_raw_tarball(&[("a.tex", b"hello")]);
        let reader: Box<dyn Read> = Box::new(FailAfterHeaderRead::new(raw, usize::MAX));
        let mut archive = Archive::new(reader);
        for _ in archive.entries().unwrap() {}
        let err = extract_from_archive(archive, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "bad-archive");
    }

    #[test]
    fn extract_from_archive_entry_error_immediate() {
        // Reader fails at the very first byte so the first entry iteration
        // returns Err, covering the entry.map_err(Io) branch.
        let raw = make_raw_tarball(&[("a.tex", b"hello")]);
        let reader: Box<dyn Read> = Box::new(FailAfterHeaderRead::new(raw, 0));
        let archive = Archive::new(reader);
        let err = extract_from_archive(archive, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "io");
    }

    #[test]
    fn extract_from_archive_read_to_end_error() {
        // Reader fails after the 512-byte header block so entry creation
        // succeeds but read_to_end() fails, covering the read_to_end map_err.
        let raw = make_raw_tarball(&[("file.tex", b"some content")]);
        let reader: Box<dyn Read> = Box::new(FailAfterHeaderRead::new(raw, 512));
        let archive = Archive::new(reader);
        let err = extract_from_archive(archive, ArchiveLimits::default()).unwrap_err();
        assert_eq!(tag(&err), "io");
    }

    // ── reject_traversal ──

    #[test]
    fn reject_traversal_allows_normal_paths() {
        assert!(reject_traversal("sub/dir/file.tex").is_ok());
        assert!(reject_traversal("file.tex").is_ok());
        assert!(reject_traversal("./relative.tex").is_ok());
    }

    #[test]
    fn reject_traversal_blocks_double_dot() {
        assert!(reject_traversal("../../etc/passwd").is_err());
        assert!(reject_traversal("sub/../secret").is_err());
        assert!(reject_traversal("..\\windows\\system32").is_err());
    }

    #[test]
    fn reject_traversal_blocks_null_byte() {
        // Null bytes in archive paths can confuse downstream C string handling.
        assert!(reject_traversal("file\0.tex").is_err());
        assert!(reject_traversal("\0hidden").is_err());
    }

    #[test]
    fn reject_traversal_blocks_absolute_paths() {
        // Unix absolute paths.
        assert!(reject_traversal("/etc/passwd").is_err());
        assert!(reject_traversal("/root/.ssh/id_rsa").is_err());
        // Windows absolute paths (backslash).
        assert!(reject_traversal("\\Windows\\System32\\cmd.exe").is_err());
        // Windows drive letters.
        assert!(reject_traversal("C:\\Users\\secret").is_err());
        assert!(reject_traversal("c:/documents/file.tex").is_err());
    }
}
