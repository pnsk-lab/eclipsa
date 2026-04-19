use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct NativeNode {
    pub id: String,
    pub tag: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub props: BTreeMap<String, String>,
    pub children: Vec<NativeNode>,
}

impl NativeNode {
    pub fn string_prop(&self, key: &str) -> Option<&str> {
        self.props.get(key).map(String::as_str)
    }

    pub fn bool_prop(&self, key: &str) -> Option<bool> {
        self.string_prop(key).map(|value| value == "true")
    }

    pub fn double_prop(&self, key: &str) -> Option<f64> {
        self.string_prop(key)?.parse::<f64>().ok()
    }
}
