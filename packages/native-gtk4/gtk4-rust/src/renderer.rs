use crate::tree::NativeNode;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
struct RendererRecord {
    child_ids: Vec<String>,
    props: BTreeMap<String, String>,
    tag: String,
    text: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Gtk4RendererBridge {
    next_id: usize,
    pending_publish: bool,
    records: BTreeMap<String, RendererRecord>,
    root: Option<NativeNode>,
    root_node_id: Option<String>,
}

impl Gtk4RendererBridge {
    pub fn create_element(&mut self, type_name: &str) -> String {
        let node_id = self.allocate_id();
        self.records.insert(
            node_id.clone(),
            RendererRecord {
                child_ids: Vec::new(),
                props: BTreeMap::new(),
                tag: type_name.to_owned(),
                text: None,
            },
        );
        node_id
    }

    pub fn create_text(&mut self, value: &str) -> String {
        let node_id = self.allocate_id();
        self.records.insert(
            node_id.clone(),
            RendererRecord {
                child_ids: Vec::new(),
                props: BTreeMap::new(),
                tag: "gtk4:text".to_owned(),
                text: Some(value.to_owned()),
            },
        );
        node_id
    }

    pub fn insert(&mut self, parent_id: &str, child_id: &str, before_id: Option<&str>) {
        let Some(parent) = self.records.get_mut(parent_id) else {
            return;
        };
        parent.child_ids.retain(|candidate| candidate != child_id);
        if let Some(before_id) = before_id {
            if let Some(index) = parent
                .child_ids
                .iter()
                .position(|candidate| candidate == before_id)
            {
                parent.child_ids.insert(index, child_id.to_owned());
                return;
            }
        }
        parent.child_ids.push(child_id.to_owned());
    }

    pub fn remove(&mut self, parent_id: &str, child_id: &str) {
        if let Some(parent) = self.records.get_mut(parent_id) {
            parent.child_ids.retain(|candidate| candidate != child_id);
        }
        self.remove_subtree(child_id);
    }

    pub fn reorder(&mut self, parent_id: &str, child_id: &str, before_id: Option<&str>) {
        self.insert(parent_id, child_id, before_id);
    }

    pub fn set_prop(&mut self, node_id: &str, key: &str, value: &str) {
        let Some(record) = self.records.get_mut(node_id) else {
            return;
        };
        record.props.insert(key.to_owned(), value.to_owned());
    }

    pub fn remove_prop(&mut self, node_id: &str, key: &str) {
        let Some(record) = self.records.get_mut(node_id) else {
            return;
        };
        record.props.remove(key);
    }

    pub fn set_text(&mut self, node_id: &str, value: &str) {
        let Some(record) = self.records.get_mut(node_id) else {
            return;
        };
        record.text = Some(value.to_owned());
    }

    pub fn publish(&mut self, root_id: Option<&str>) {
        if let Some(root_id) = root_id {
            self.root_node_id = Some(root_id.to_owned());
        }
        self.root = self
            .root_node_id
            .as_deref()
            .and_then(|root_node_id| self.materialize_tree(root_node_id));
        self.pending_publish = true;
    }

    pub fn take_pending_publish(&mut self) -> bool {
        let pending_publish = self.pending_publish;
        self.pending_publish = false;
        pending_publish
    }

    pub fn root(&self) -> Option<&NativeNode> {
        self.root.as_ref()
    }

    pub fn render_fallback(&mut self, title: &str, message: &str) {
        self.next_id = 0;
        self.records.clear();
        self.root = None;
        self.root_node_id = None;

        let root = self.create_element("gtk4:box");
        self.set_prop(&root, "orientation", "vertical");
        self.set_prop(&root, "spacing", "12");

        let title_node = self.create_element("gtk4:text");
        self.set_prop(&title_node, "value", title);
        self.insert(&root, &title_node, None);

        let body_node = self.create_element("gtk4:text");
        self.set_prop(&body_node, "value", message);
        self.insert(&root, &body_node, None);

        self.publish(Some(&root));
    }

    fn allocate_id(&mut self) -> String {
        self.next_id += 1;
        format!("gtk4-node-{}", self.next_id)
    }

    fn materialize_tree(&self, node_id: &str) -> Option<NativeNode> {
        let record = self.records.get(node_id)?;
        Some(NativeNode {
            id: node_id.to_owned(),
            tag: record.tag.clone(),
            text: record.text.clone(),
            props: record.props.clone(),
            children: record
                .child_ids
                .iter()
                .filter_map(|child_id| self.materialize_tree(child_id))
                .collect(),
        })
    }

    fn remove_subtree(&mut self, node_id: &str) {
        let Some(record) = self.records.remove(node_id) else {
            return;
        };
        for child_id in record.child_ids {
            self.remove_subtree(&child_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Gtk4RendererBridge;

    #[test]
    fn publish_marks_and_clears_pending_updates() {
        let mut bridge = Gtk4RendererBridge::default();
        let root = bridge.create_element("gtk4:window");

        bridge.publish(Some(&root));

        assert!(bridge.take_pending_publish());
        assert!(!bridge.take_pending_publish());
    }
}
