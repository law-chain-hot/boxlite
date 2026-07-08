//! Bind mount configuration.

use std::path::Path;

/// Configuration for creating a bind mount.
#[derive(Debug, Clone)]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub struct BindMountConfig<'a> {
    pub source: &'a Path,
    pub target: &'a Path,
    pub read_only: bool,
    pub recursive: bool,
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl<'a> BindMountConfig<'a> {
    pub fn new(source: &'a Path, target: &'a Path) -> Self {
        Self {
            source,
            target,
            read_only: false,
            recursive: false,
        }
    }

    pub fn read_only(mut self) -> Self {
        self.read_only = true;
        self
    }

    pub fn recursive(mut self) -> Self {
        self.recursive = true;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builder_tracks_read_only_and_recursive_flags() {
        let source = Path::new("/source");
        let target = Path::new("/target");

        let config = BindMountConfig::new(source, target).read_only().recursive();

        assert_eq!(config.source, source);
        assert_eq!(config.target, target);
        assert!(config.read_only);
        assert!(config.recursive);
    }
}
