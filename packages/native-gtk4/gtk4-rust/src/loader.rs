use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use url::Url;

#[derive(Clone, Debug)]
pub struct BootstrapScript {
    pub origin: String,
    pub source: String,
}

#[derive(Clone, Debug)]
pub struct NativeDevManifest {
    pub entry: String,
    pub hmr_url: String,
    pub rpc_url: String,
}

#[derive(Clone, Debug)]
pub enum NativeApplicationDescriptor {
    Script(BootstrapScript),
    Dev(NativeDevManifest),
}

pub trait BootstrapScriptLoading {
    fn load(&self) -> Result<NativeApplicationDescriptor>;
}

#[derive(Debug, Default)]
pub struct DefaultBootstrapScriptLoader {
    environment: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct NativeBundleManifest {
    bootstrap: Option<String>,
    entry: Option<String>,
    hmr: Option<NativeBundleHmrManifest>,
    mode: Option<String>,
    rpc: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NativeBundleHmrManifest {
    url: String,
}

impl DefaultBootstrapScriptLoader {
    pub fn new() -> Self {
        Self {
            environment: std::env::vars().collect(),
        }
    }

    pub fn with_environment(environment: impl IntoIterator<Item = (String, String)>) -> Self {
        Self {
            environment: environment.into_iter().collect(),
        }
    }

    fn load_from_manifest(&self, location: &str) -> Result<NativeApplicationDescriptor> {
        let manifest_url = resolve_location(location)?;
        let manifest_source = read_to_string(&manifest_url)
            .with_context(|| format!("Failed to load native bundle manifest at {location}."))?;
        let manifest: NativeBundleManifest = serde_json::from_str(&manifest_source)
            .with_context(|| format!("Failed to decode native bundle manifest at {location}."))?;

        if manifest.mode.as_deref() == Some("dev") {
            let entry = manifest
                .entry
                .ok_or_else(|| anyhow!("Native dev manifest is missing entry."))?;
            let rpc_url = manifest
                .rpc
                .ok_or_else(|| anyhow!("Native dev manifest is missing rpc."))?;
            let hmr_url = manifest
                .hmr
                .map(|hmr| hmr.url)
                .ok_or_else(|| anyhow!("Native dev manifest is missing hmr.url."))?;
            return Ok(NativeApplicationDescriptor::Dev(NativeDevManifest {
                entry,
                hmr_url,
                rpc_url,
            }));
        }

        let bootstrap = manifest
            .bootstrap
            .ok_or_else(|| anyhow!("Native bundle manifest is missing bootstrap."))?;
        let bootstrap_url =
            resolve_relative_location(&manifest_url, &bootstrap).with_context(|| {
                format!("Failed to resolve native bootstrap script at {bootstrap}.")
            })?;
        let source = read_to_string(&bootstrap_url)
            .with_context(|| format!("Failed to load native bootstrap script at {bootstrap}."))?;
        Ok(NativeApplicationDescriptor::Script(BootstrapScript {
            origin: bootstrap_url.to_string(),
            source,
        }))
    }
}

impl BootstrapScriptLoading for DefaultBootstrapScriptLoader {
    fn load(&self) -> Result<NativeApplicationDescriptor> {
        let manifest_location = self
            .environment
            .get("ECLIPSA_NATIVE_MANIFEST")
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                anyhow!("Set ECLIPSA_NATIVE_MANIFEST before booting the native host.")
            })?;
        self.load_from_manifest(manifest_location)
    }
}

fn resolve_location(location: &str) -> Result<Url> {
    if let Ok(url) = Url::parse(location) {
        return Ok(url);
    }

    let expanded = shellexpand(location);
    let path = PathBuf::from(expanded);
    let canonical = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()?.join(path)
    };
    Url::from_file_path(&canonical)
        .map_err(|_| anyhow!("Failed to resolve native bundle location {location}."))
}

fn resolve_relative_location(base_url: &Url, location: &str) -> Result<Url> {
    if let Ok(url) = Url::parse(location) {
        return Ok(url);
    }

    match base_url.scheme() {
        "file" => {
            let base_path = base_url
                .to_file_path()
                .map_err(|_| anyhow!("Invalid file manifest URL."))?;
            let resolved = base_path.parent().unwrap_or(Path::new("/")).join(location);
            Url::from_file_path(resolved).map_err(|_| anyhow!("Failed to resolve file URL."))
        }
        _ => base_url
            .join(location)
            .map_err(|error| anyhow!("Failed to resolve remote URL: {error}")),
    }
}

fn read_to_string(url: &Url) -> Result<String> {
    match url.scheme() {
        "http" | "https" => {
            let response = ureq::get(url.as_str()).call()?;
            let mut body = response.into_body();
            Ok(body.read_to_string()?)
        }
        "file" => {
            let path = url
                .to_file_path()
                .map_err(|_| anyhow!("Invalid file URL {url}."))?;
            Ok(fs::read_to_string(path)?)
        }
        scheme => bail!("Unsupported manifest URL scheme {scheme}."),
    }
}

fn shellexpand(value: &str) -> String {
    if value == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| value.to_owned());
    }
    if let Some(stripped) = value.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{stripped}");
        }
    }
    value.to_owned()
}
