#![cfg(feature = "gtk-ui")]

use gtk4::glib;
use gtk4::prelude::*;
use gtk4::subclass::prelude::*;
use std::cell::RefCell;

mod imp {
    use super::*;

    #[derive(Default)]
    pub struct SnapshotHostWidget {
        pub child: RefCell<Option<gtk4::Widget>>,
    }

    #[glib::object_subclass]
    impl ObjectSubclass for SnapshotHostWidget {
        const NAME: &'static str = "EclipsaSnapshotHostWidget";
        type Type = super::SnapshotHostWidget;
        type ParentType = gtk4::Widget;

        fn class_init(klass: &mut Self::Class) {
            klass.set_css_name("eclipsa-native-snapshot-host");
            klass.set_layout_manager_type::<gtk4::BinLayout>();
        }
    }

    impl ObjectImpl for SnapshotHostWidget {
        fn dispose(&self) {
            if let Some(child) = self.child.borrow_mut().take() {
                child.unparent();
            }
        }
    }

    impl WidgetImpl for SnapshotHostWidget {
        fn snapshot(&self, snapshot: &gtk4::Snapshot) {
            if let Some(child) = self.child.borrow().as_ref() {
                self.obj().snapshot_child(child, snapshot);
            }
        }
    }
}

glib::wrapper! {
    pub struct SnapshotHostWidget(ObjectSubclass<imp::SnapshotHostWidget>)
        @extends gtk4::Widget,
        @implements gtk4::Accessible, gtk4::Buildable, gtk4::ConstraintTarget;
}

impl Default for SnapshotHostWidget {
    fn default() -> Self {
        Self::new()
    }
}

impl SnapshotHostWidget {
    pub fn new() -> Self {
        let widget: Self = glib::Object::new();
        widget.set_hexpand(true);
        widget.set_vexpand(true);
        widget.set_visible(true);
        widget
    }

    pub fn content(&self) -> Option<gtk4::Widget> {
        self.imp().child.borrow().clone()
    }

    pub fn set_content(&self, child: Option<&gtk4::Widget>) {
        let imp = self.imp();
        if let Some(existing_child) = imp.child.borrow_mut().take() {
            existing_child.unparent();
        }
        if let Some(child) = child {
            child.set_parent(self);
            imp.child.borrow_mut().replace(child.clone());
        }
        self.queue_allocate();
        self.queue_resize();
        self.queue_draw();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[gtk4::test]
    fn replaces_content_without_replacing_root_widget() {
        let root = SnapshotHostWidget::new();
        let first = gtk4::Label::new(Some("First"));
        let second = gtk4::Label::new(Some("Second"));

        root.set_content(Some(first.upcast_ref()));
        assert_eq!(root.content().as_ref(), Some(first.upcast_ref()));
        assert_eq!(first.parent().as_ref(), Some(root.upcast_ref()));

        root.set_content(Some(second.upcast_ref()));
        assert_eq!(root.content().as_ref(), Some(second.upcast_ref()));
        assert!(first.parent().is_none());
        assert_eq!(second.parent().as_ref(), Some(root.upcast_ref()));
    }
}
