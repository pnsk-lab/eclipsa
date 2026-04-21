#[cfg(feature = "gtk-ui")]
mod app {
    use anyhow::Result;
    use eclipsa_native_gtk4_host::{
        is_dev_manifest_source, EclipsaGtk4Host, HostUiAction, NativeNode, PumpResult,
    };
    use gtk4::gdk::FrameClockPhase;
    use gtk4::gio;
    use gtk4::prelude::*;
    use gtk4::{
        Align, Application, ApplicationWindow, Box as GtkBox, Button, Entry, Image, Label, ListBox,
        Orientation, Switch, Widget,
    };
    use std::cell::RefCell;
    #[cfg(test)]
    use std::collections::BTreeMap;
    use std::collections::VecDeque;
    use std::rc::Rc;

    const NODE_ID_DATA_KEY: &str = "eclipsa-native-node-id";
    const NODE_TAG_DATA_KEY: &str = "eclipsa-native-node-tag";

    #[derive(Clone, Debug)]
    struct FocusState {
        cursor_position: Option<i32>,
        node_id: String,
    }

    pub fn run() -> Result<()> {
        let application_flags =
            if is_dev_manifest_source(std::env::var("ECLIPSA_NATIVE_MANIFEST").ok().as_deref()) {
                gio::ApplicationFlags::NON_UNIQUE
            } else {
                gio::ApplicationFlags::empty()
            };
        let app = Application::builder()
            .application_id("dev.eclipsa.nativegtk4")
            .flags(application_flags)
            .build();
        app.connect_activate(|app| {
            let host = Rc::new(RefCell::new(
                EclipsaGtk4Host::new().expect("create GTK host"),
            ));
            let pending_actions = Rc::new(RefCell::new(VecDeque::<HostUiAction>::new()));
            if let Err(error) = host.borrow_mut().boot_or_render_fallback() {
                eprintln!("{error:?}");
            }

            let window = build_window(app);

            refresh_window(
                &window,
                Rc::clone(&host),
                Rc::clone(&pending_actions),
                false,
            );
            host.borrow_mut().take_render_update();

            let host_for_tick = Rc::clone(&host);
            let pending_actions_for_tick = Rc::clone(&pending_actions);
            let window_for_tick = window.clone();
            gtk4::glib::timeout_add_local(std::time::Duration::from_millis(25), move || {
                let actions = {
                    let mut pending_actions = pending_actions_for_tick.borrow_mut();
                    std::mem::take(&mut *pending_actions)
                };
                let pump_result = {
                    let mut host = host_for_tick.borrow_mut();
                    match host.pump(actions) {
                        Ok(result) => result,
                        Err(error) => {
                            eprintln!("{error:?}");
                            PumpResult::default()
                        }
                    }
                };
                if pump_result.needs_refresh {
                    refresh_window(
                        &window_for_tick,
                        Rc::clone(&host_for_tick),
                        Rc::clone(&pending_actions_for_tick),
                        pump_result.requires_full_rebuild,
                    );
                }
                gtk4::glib::ControlFlow::Continue
            });

            window.present();
        });
        app.run();
        Ok(())
    }

    fn build_window(app: &Application) -> ApplicationWindow {
        ApplicationWindow::builder()
            .application(app)
            .default_height(640)
            .default_width(480)
            .title("Eclipsa Native GTK 4")
            .build()
    }

    fn refresh_window(
        window: &ApplicationWindow,
        host: Rc<RefCell<EclipsaGtk4Host>>,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
        force_rebuild: bool,
    ) {
        let Some(root) = host.borrow().root() else {
            return;
        };
        let focus_state = capture_focus_state(window);
        if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
            eprintln!("EclipsaNative GTK refresh: {}", summarize_root(&root));
        }
        let content_node = if matches!(root.tag.as_str(), "gtk4:application-window" | "gtk4:window")
        {
            if let Some(title) = root.string_prop("title") {
                window.set_title(Some(title));
            }
            if let Some(width) = root.double_prop("defaultWidth") {
                window.set_default_width(width as i32);
            }
            if let Some(height) = root.double_prop("defaultHeight") {
                window.set_default_height(height as i32);
            }
            root.children.first()
        } else {
            Some(&root)
        };
        sync_window_content(
            window,
            content_node,
            Rc::clone(&pending_actions),
            force_rebuild,
        );
        if force_rebuild {
            restore_focus_state(window, focus_state);
        }
        if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
            if let Some(child) = window.child() {
                eprintln!(
                    "EclipsaNative GTK widget: {}",
                    summarize_widget_tree(&child)
                );
            }
        }
        if let Some(child) = window.child() {
            child.queue_allocate();
            child.queue_resize();
            child.queue_draw();
        }
        window.queue_allocate();
        window.queue_resize();
        window.queue_draw();
        window.present();
        if let Some(surface) = window.surface() {
            surface.request_layout();
            surface.queue_render();
            surface.frame_clock().request_phase(
                FrameClockPhase::UPDATE | FrameClockPhase::LAYOUT | FrameClockPhase::PAINT,
            );
        }
        if let Some(display) = gtk4::gdk::Display::default() {
            display.flush();
            display.sync();
        }
    }

    fn capture_focus_state(window: &ApplicationWindow) -> Option<FocusState> {
        let raw_focus = gtk4::prelude::GtkWindowExt::focus(window)?;
        let mut widget = raw_focus.clone();
        loop {
            if let Some(node_id) = widget_data(&widget, NODE_ID_DATA_KEY) {
                let cursor_position = raw_focus
                    .downcast_ref::<Entry>()
                    .map(|entry| entry.position());
                return Some(FocusState {
                    cursor_position,
                    node_id,
                });
            }
            widget = widget.parent()?;
        }
    }

    fn restore_focus_state(window: &ApplicationWindow, focus_state: Option<FocusState>) {
        let Some(focus_state) = focus_state else {
            return;
        };
        let Some(child) = window.child() else {
            return;
        };
        let Some(widget) = find_widget_by_node_id(&child, &focus_state.node_id) else {
            return;
        };
        let _ = widget.grab_focus();
        if let Some(cursor_position) = focus_state.cursor_position {
            if let Some(entry) = widget.downcast_ref::<Entry>() {
                entry.set_position(cursor_position.min(i32::from(entry.text_length())));
            }
        }
    }

    fn find_widget_by_node_id(widget: &Widget, node_id: &str) -> Option<Widget> {
        if widget_data(widget, NODE_ID_DATA_KEY).as_deref() == Some(node_id) {
            return Some(widget.clone());
        }
        for child in collect_children(widget) {
            if let Some(found) = find_widget_by_node_id(&child, node_id) {
                return Some(found);
            }
        }
        None
    }

    fn summarize_root(node: &NativeNode) -> String {
        let mut parts = Vec::new();
        collect_node_summaries(node, &mut parts);
        parts.join(" | ")
    }

    fn collect_node_summaries(node: &NativeNode, parts: &mut Vec<String>) {
        match node.tag.as_str() {
            "gtk4:text" => {
                if let Some(value) = node.string_prop("value").or(node.text.as_deref()) {
                    parts.push(format!("{}#{} value={value}", node.tag, node.id));
                }
            }
            "gtk4:button" => {
                parts.push(format!(
                    "{}#{} title={}",
                    node.tag,
                    node.id,
                    button_label(node)
                ));
            }
            "gtk4:text-field" | "gtk4:text-input" => {
                parts.push(format!(
                    "{}#{} value={}",
                    node.tag,
                    node.id,
                    node.string_prop("value").unwrap_or_default()
                ));
            }
            "gtk4:switch" => {
                parts.push(format!(
                    "{}#{} value={}",
                    node.tag,
                    node.id,
                    node.bool_prop("value").unwrap_or(false)
                ));
            }
            _ => {}
        }
        for child in &node.children {
            collect_node_summaries(child, parts);
        }
    }

    fn sync_window_content(
        window: &ApplicationWindow,
        node: Option<&NativeNode>,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
        force_rebuild: bool,
    ) {
        let Some(node) = node else {
            window.set_child(Option::<&Widget>::None);
            return;
        };

        if force_rebuild {
            let child = build_widget(node, pending_actions);
            window.set_child(Some(&child));
            return;
        }

        if let Some(existing_child) = window.child() {
            if widget_matches_node(&existing_child, node) {
                update_widget(&existing_child, node, pending_actions);
                return;
            }
        }

        let child = build_widget(node, pending_actions);
        window.set_child(Some(&child));
    }

    fn build_widget(
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) -> Widget {
        let widget = match node.tag.as_str() {
            "gtk4:box" => build_box(node, pending_actions).upcast(),
            "gtk4:button" => build_button(node, pending_actions).upcast(),
            "gtk4:image" => build_image(node).upcast(),
            "gtk4:list-box" | "gtk4:list-view" => build_list_box(node, pending_actions).upcast(),
            "gtk4:spacer" => build_spacer(node).upcast(),
            "gtk4:switch" => build_switch(node, pending_actions).upcast(),
            "gtk4:text" => build_label(node).upcast(),
            "gtk4:text-field" | "gtk4:text-input" => {
                build_text_field(node, pending_actions).upcast()
            }
            "gtk4:application-window" | "gtk4:window" => {
                if let Some(child) = node.children.first() {
                    build_widget(child, pending_actions)
                } else {
                    build_box(node, pending_actions).upcast()
                }
            }
            _ => build_label(&NativeNode {
                id: node.id.clone(),
                tag: node.tag.clone(),
                text: None,
                props: Default::default(),
                children: Vec::new(),
            })
            .upcast(),
        };
        set_widget_metadata(&widget, node);
        widget
    }

    fn build_box(
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) -> GtkBox {
        let orientation = match node
            .string_prop("direction")
            .or(node.string_prop("orientation"))
        {
            Some("row" | "horizontal") => Orientation::Horizontal,
            _ => Orientation::Vertical,
        };
        let spacing = node.double_prop("spacing").unwrap_or(12.0) as i32;
        let widget = GtkBox::new(orientation, spacing);
        apply_widget_props(widget.upcast_ref(), node);
        for child in &node.children {
            widget.append(&build_widget(child, Rc::clone(&pending_actions)));
        }
        widget
    }

    fn build_button(
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) -> Button {
        let label = button_label(node);
        let widget = Button::with_label(&label);
        apply_widget_props(widget.upcast_ref(), node);
        let node_id = node.id.clone();
        let pending_actions = Rc::clone(&pending_actions);
        widget.connect_clicked(move |_| {
            if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
                eprintln!("EclipsaNative GTK action: click {}", node_id);
            }
            pending_actions.borrow_mut().push_back(HostUiAction::Click {
                node_id: node_id.clone(),
            });
        });
        widget
    }

    fn build_image(node: &NativeNode) -> Image {
        let widget = if let Some(icon_name) = node.string_prop("iconName") {
            Image::from_icon_name(icon_name)
        } else {
            Image::new()
        };
        apply_widget_props(widget.upcast_ref(), node);
        widget
    }

    fn build_label(node: &NativeNode) -> Label {
        let label = node
            .string_prop("value")
            .or(node.text.as_deref())
            .unwrap_or_default();
        let widget = Label::new(Some(label));
        widget.set_wrap(node.bool_prop("wrap").unwrap_or(false));
        widget.set_selectable(node.bool_prop("selectable").unwrap_or(false));
        apply_widget_props(widget.upcast_ref(), node);
        widget
    }

    fn build_list_box(
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) -> ListBox {
        let widget = ListBox::new();
        apply_widget_props(widget.upcast_ref(), node);
        for child in &node.children {
            widget.append(&build_widget(child, Rc::clone(&pending_actions)));
        }
        widget
    }

    fn build_spacer(node: &NativeNode) -> GtkBox {
        let widget = GtkBox::new(Orientation::Vertical, 0);
        widget.set_hexpand(true);
        widget.set_vexpand(true);
        apply_widget_props(widget.upcast_ref(), node);
        widget
    }

    fn build_switch(
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) -> GtkBox {
        let row = GtkBox::new(Orientation::Horizontal, 12);
        apply_widget_props(row.upcast_ref(), node);
        let label = Label::new(Some(node.string_prop("title").unwrap_or("Enabled")));
        row.append(&label);
        let switch = Switch::new();
        switch.set_active(node.bool_prop("value").unwrap_or(false));
        let node_id = node.id.clone();
        let pending_actions = Rc::clone(&pending_actions);
        switch.connect_active_notify(move |widget| {
            let value = widget.is_active();
            if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
                eprintln!("EclipsaNative GTK action: toggle {}={value}", node_id);
            }
            pending_actions
                .borrow_mut()
                .push_back(HostUiAction::Toggle {
                    node_id: node_id.clone(),
                    value,
                });
        });
        row.append(&switch);
        row
    }

    fn build_text_field(
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) -> Entry {
        let widget = Entry::new();
        widget.set_text(node.string_prop("value").unwrap_or_default());
        widget.set_placeholder_text(node.string_prop("placeholder"));
        apply_widget_props(widget.upcast_ref(), node);
        let node_id = node.id.clone();
        let pending_actions = Rc::clone(&pending_actions);
        widget.connect_changed(move |entry| {
            let value = entry.text().to_string();
            if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
                eprintln!("EclipsaNative GTK action: input {}={value}", node_id);
            }
            pending_actions.borrow_mut().push_back(HostUiAction::Input {
                node_id: node_id.clone(),
                value,
            });
        });
        widget
    }

    fn update_widget(
        widget: &Widget,
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        match node.tag.as_str() {
            "gtk4:box" => {
                if let Some(box_widget) = widget.downcast_ref::<GtkBox>() {
                    update_box(box_widget, node, pending_actions);
                }
            }
            "gtk4:button" => {
                if let Some(button) = widget.downcast_ref::<Button>() {
                    update_button(button, node);
                }
            }
            "gtk4:image" => {
                if let Some(image) = widget.downcast_ref::<Image>() {
                    update_image(image, node);
                }
            }
            "gtk4:list-box" | "gtk4:list-view" => {
                if let Some(list_box) = widget.downcast_ref::<ListBox>() {
                    update_list_box(list_box, node, pending_actions);
                }
            }
            "gtk4:spacer" => {
                if let Some(spacer) = widget.downcast_ref::<GtkBox>() {
                    update_spacer(spacer, node);
                }
            }
            "gtk4:switch" => {
                if let Some(row) = widget.downcast_ref::<GtkBox>() {
                    update_switch(row, node, pending_actions);
                }
            }
            "gtk4:text" => {
                if let Some(label) = widget.downcast_ref::<Label>() {
                    update_label(label, node);
                }
            }
            "gtk4:text-field" | "gtk4:text-input" => {
                if let Some(entry) = widget.downcast_ref::<Entry>() {
                    update_text_field(entry, node);
                }
            }
            _ => {
                if let Some(label) = widget.downcast_ref::<Label>() {
                    update_label(label, node);
                }
            }
        }
        set_widget_metadata(widget, node);
    }

    fn update_box(
        widget: &GtkBox,
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        let orientation = match node
            .string_prop("direction")
            .or(node.string_prop("orientation"))
        {
            Some("row" | "horizontal") => Orientation::Horizontal,
            _ => Orientation::Vertical,
        };
        widget.set_orientation(orientation);
        widget.set_spacing(node.double_prop("spacing").unwrap_or(12.0) as i32);
        apply_widget_props(widget.upcast_ref(), node);
        sync_box_children(widget, &node.children, pending_actions);
    }

    fn update_button(widget: &Button, node: &NativeNode) {
        widget.set_label(&button_label(node));
        apply_widget_props(widget.upcast_ref(), node);
    }

    fn update_image(widget: &Image, node: &NativeNode) {
        widget.set_icon_name(node.string_prop("iconName"));
        apply_widget_props(widget.upcast_ref(), node);
    }

    fn update_label(widget: &Label, node: &NativeNode) {
        let label = node
            .string_prop("value")
            .or(node.text.as_deref())
            .unwrap_or_default();
        widget.set_label(label);
        widget.set_wrap(node.bool_prop("wrap").unwrap_or(false));
        widget.set_selectable(node.bool_prop("selectable").unwrap_or(false));
        apply_widget_props(widget.upcast_ref(), node);
    }

    fn update_list_box(
        widget: &ListBox,
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        apply_widget_props(widget.upcast_ref(), node);
        sync_list_box_children(widget, &node.children, pending_actions);
    }

    fn update_spacer(widget: &GtkBox, node: &NativeNode) {
        widget.set_hexpand(true);
        widget.set_vexpand(true);
        apply_widget_props(widget.upcast_ref(), node);
    }

    fn update_switch(
        row: &GtkBox,
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        row.set_orientation(Orientation::Horizontal);
        row.set_spacing(12);
        apply_widget_props(row.upcast_ref(), node);

        let children = collect_children(row.upcast_ref());
        let Some(label_widget) = children
            .first()
            .and_then(|child| child.downcast_ref::<Label>())
        else {
            repopulate_switch_row(row, node, pending_actions);
            return;
        };
        let Some(switch_widget) = children
            .get(1)
            .and_then(|child| child.downcast_ref::<Switch>())
        else {
            repopulate_switch_row(row, node, pending_actions);
            return;
        };
        if children.len() != 2 {
            repopulate_switch_row(row, node, pending_actions);
            return;
        }

        label_widget.set_label(node.string_prop("title").unwrap_or("Enabled"));
        let next_value = node.bool_prop("value").unwrap_or(false);
        if switch_widget.is_active() != next_value {
            switch_widget.set_active(next_value);
        }
    }

    fn update_text_field(widget: &Entry, node: &NativeNode) {
        let value = node.string_prop("value").unwrap_or_default();
        if widget.text().as_str() != value {
            widget.set_text(value);
        }
        widget.set_placeholder_text(node.string_prop("placeholder"));
        apply_widget_props(widget.upcast_ref(), node);
    }

    fn sync_box_children(
        widget: &GtkBox,
        nodes: &[NativeNode],
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        let children = collect_children(widget.upcast_ref());
        if children.len() == nodes.len()
            && children
                .iter()
                .zip(nodes)
                .all(|(child, node)| widget_matches_node(child, node))
        {
            for (child, node) in children.iter().zip(nodes) {
                update_widget(child, node, Rc::clone(&pending_actions));
            }
            return;
        }

        clear_box_children(widget);
        for child in nodes {
            widget.append(&build_widget(child, Rc::clone(&pending_actions)));
        }
    }

    fn sync_list_box_children(
        widget: &ListBox,
        nodes: &[NativeNode],
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        let children = collect_children(widget.upcast_ref());
        if children.len() == nodes.len()
            && children
                .iter()
                .zip(nodes)
                .all(|(child, node)| widget_matches_node(child, node))
        {
            for (child, node) in children.iter().zip(nodes) {
                update_widget(child, node, Rc::clone(&pending_actions));
            }
            return;
        }

        clear_list_box_children(widget);
        for child in nodes {
            widget.append(&build_widget(child, Rc::clone(&pending_actions)));
        }
    }

    fn repopulate_switch_row(
        row: &GtkBox,
        node: &NativeNode,
        pending_actions: Rc<RefCell<VecDeque<HostUiAction>>>,
    ) {
        clear_box_children(row);
        let label = Label::new(Some(node.string_prop("title").unwrap_or("Enabled")));
        row.append(&label);
        let switch = Switch::new();
        switch.set_active(node.bool_prop("value").unwrap_or(false));
        let node_id = node.id.clone();
        switch.connect_active_notify(move |widget| {
            let value = widget.is_active();
            if std::env::var_os("ECLIPSA_NATIVE_DEBUG_HMR").is_some() {
                eprintln!("EclipsaNative GTK action: toggle {}={value}", node_id);
            }
            pending_actions
                .borrow_mut()
                .push_back(HostUiAction::Toggle {
                    node_id: node_id.clone(),
                    value,
                });
        });
        row.append(&switch);
    }

    fn collect_children(widget: &Widget) -> Vec<Widget> {
        let mut children = Vec::new();
        let mut next_child = widget.first_child();
        while let Some(child) = next_child {
            next_child = child.next_sibling();
            children.push(child);
        }
        children
    }

    fn clear_box_children(widget: &GtkBox) {
        while let Some(child) = widget.first_child() {
            widget.remove(&child);
        }
    }

    fn clear_list_box_children(widget: &ListBox) {
        while let Some(child) = widget.first_child() {
            widget.remove(&child);
        }
    }

    fn button_label(node: &NativeNode) -> String {
        if node.children.is_empty() {
            node.string_prop("title").unwrap_or("Button").to_owned()
        } else {
            node.children
                .iter()
                .filter_map(|child| child.string_prop("value"))
                .collect::<Vec<_>>()
                .join(" ")
        }
    }

    fn set_widget_metadata(widget: &Widget, node: &NativeNode) {
        unsafe {
            widget.set_data(NODE_ID_DATA_KEY, node.id.clone());
            widget.set_data(NODE_TAG_DATA_KEY, node.tag.clone());
        }
    }

    fn widget_matches_node(widget: &Widget, node: &NativeNode) -> bool {
        widget_data(widget, NODE_ID_DATA_KEY).as_deref() == Some(node.id.as_str())
            && widget_data(widget, NODE_TAG_DATA_KEY).as_deref() == Some(node.tag.as_str())
    }

    fn widget_data(widget: &Widget, key: &str) -> Option<String> {
        unsafe {
            widget
                .data::<String>(key)
                .map(|value| value.as_ref().clone())
        }
    }

    fn summarize_widget_tree(widget: &Widget) -> String {
        let mut parts = Vec::new();
        collect_widget_summaries(widget, &mut parts);
        parts.join(" | ")
    }

    fn collect_widget_summaries(widget: &Widget, parts: &mut Vec<String>) {
        let children = collect_children(widget);
        let tag = widget_data(widget, NODE_TAG_DATA_KEY);
        let id = widget_data(widget, NODE_ID_DATA_KEY);
        match tag.as_deref() {
            Some("gtk4:text") => {
                if let Some(label) = widget.downcast_ref::<Label>() {
                    parts.push(format!(
                        "gtk4:text#{} value={}",
                        id.as_deref().unwrap_or("?"),
                        label.label()
                    ));
                }
            }
            Some("gtk4:button") => {
                if let Some(button) = widget.downcast_ref::<Button>() {
                    parts.push(format!(
                        "gtk4:button#{} title={}",
                        id.as_deref().unwrap_or("?"),
                        button.label().as_deref().unwrap_or_default()
                    ));
                }
            }
            Some("gtk4:text-field" | "gtk4:text-input") => {
                if let Some(entry) = widget.downcast_ref::<Entry>() {
                    parts.push(format!(
                        "{}#{} value={}",
                        tag.as_deref().unwrap_or("gtk4:text-input"),
                        id.as_deref().unwrap_or("?"),
                        entry.text()
                    ));
                }
            }
            Some("gtk4:switch") => {
                if let Some(box_widget) = widget.downcast_ref::<GtkBox>() {
                    let children = collect_children(box_widget.upcast_ref());
                    if let Some(switch) = children
                        .get(1)
                        .and_then(|child| child.downcast_ref::<Switch>())
                    {
                        parts.push(format!(
                            "gtk4:switch#{} value={}",
                            id.as_deref().unwrap_or("?"),
                            switch.is_active()
                        ));
                    }
                }
            }
            _ => {
                parts.push(format!(
                    "{}#{} type={} children={}",
                    tag.as_deref().unwrap_or("widget"),
                    id.as_deref().unwrap_or("?"),
                    widget.type_().name(),
                    children.len(),
                ));
            }
        }

        for child in children {
            collect_widget_summaries(&child, parts);
        }
    }

    fn apply_widget_props(widget: &Widget, node: &NativeNode) {
        widget.set_visible(node.bool_prop("visible").unwrap_or(true));
        widget.set_sensitive(node.bool_prop("sensitive").unwrap_or(true));
        widget.set_hexpand(node.bool_prop("hexpand").unwrap_or(false));
        widget.set_vexpand(node.bool_prop("vexpand").unwrap_or(false));
        if let Some(halign) = node.string_prop("halign").and_then(to_align) {
            widget.set_halign(halign);
        }
        if let Some(valign) = node.string_prop("valign").and_then(to_align) {
            widget.set_valign(valign);
        }
        if let Some(margin) = node.double_prop("margin") {
            let margin = margin as i32;
            widget.set_margin_top(margin);
            widget.set_margin_bottom(margin);
            widget.set_margin_start(margin);
            widget.set_margin_end(margin);
        }
        if let Some(padding) = node.double_prop("padding") {
            let padding = padding as i32;
            widget.set_margin_top(padding);
            widget.set_margin_bottom(padding);
            widget.set_margin_start(padding);
            widget.set_margin_end(padding);
        }
        if let Some(size) = node.double_prop("size") {
            let size = size as i32;
            widget.set_size_request(size, size);
        } else {
            let width = node
                .double_prop("width")
                .map(|value| value as i32)
                .unwrap_or(-1);
            let height = node
                .double_prop("height")
                .map(|value| value as i32)
                .unwrap_or(-1);
            if width >= 0 || height >= 0 {
                widget.set_size_request(width, height);
            }
        }
        let css_classes = parse_css_classes(node.string_prop("cssClasses"));
        let css_class_refs = css_classes.iter().map(String::as_str).collect::<Vec<_>>();
        widget.set_css_classes(&css_class_refs);
    }

    fn to_align(value: &str) -> Option<Align> {
        match value {
            "baseline" => Some(Align::Baseline),
            "center" => Some(Align::Center),
            "end" => Some(Align::End),
            "fill" => Some(Align::Fill),
            "start" => Some(Align::Start),
            _ => None,
        }
    }

    fn parse_css_classes(value: Option<&str>) -> Vec<String> {
        value
            .map(|css_classes| {
                css_classes
                    .trim_matches(['[', ']'])
                    .split(',')
                    .map(|class_name| class_name.trim().trim_matches('"'))
                    .filter(|class_name| !class_name.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn test_node(props: &[(&str, &str)]) -> NativeNode {
            NativeNode {
                id: "node-1".to_owned(),
                tag: "gtk4:text".to_owned(),
                text: None,
                props: props
                    .iter()
                    .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
                    .collect::<BTreeMap<_, _>>(),
                children: Vec::new(),
            }
        }

        #[gtk4::test]
        fn apply_widget_props_replaces_stale_css_classes() {
            let widget = Label::new(None);

            apply_widget_props(
                widget.upcast_ref(),
                &test_node(&[("cssClasses", r#"["first","second"]"#)]),
            );
            assert_eq!(
                widget
                    .css_classes()
                    .into_iter()
                    .map(|class_name| class_name.to_string())
                    .collect::<Vec<_>>(),
                vec!["first".to_owned(), "second".to_owned()],
            );

            apply_widget_props(
                widget.upcast_ref(),
                &test_node(&[("cssClasses", r#"["second","third"]"#)]),
            );
            assert_eq!(
                widget
                    .css_classes()
                    .into_iter()
                    .map(|class_name| class_name.to_string())
                    .collect::<Vec<_>>(),
                vec!["second".to_owned(), "third".to_owned()],
            );
        }
    }
}

#[cfg(feature = "gtk-ui")]
fn main() {
    if let Err(error) = app::run() {
        eprintln!("{error:?}");
        std::process::exit(1);
    }
}

#[cfg(not(feature = "gtk-ui"))]
fn main() {
    eprintln!("The GTK UI binary requires the gtk-ui feature.");
    std::process::exit(1);
}
