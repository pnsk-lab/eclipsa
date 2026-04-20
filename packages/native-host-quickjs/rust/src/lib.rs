use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;

use rquickjs::{Context, Runtime};

pub struct QuickJsSession {
    context: Context,
    runtime: Runtime,
}

impl QuickJsSession {
    fn new() -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|error| error.to_string())?;
        let context = Context::full(&runtime).map_err(|error| error.to_string())?;
        Ok(Self { context, runtime })
    }

    fn eval(&self, code: &str) -> Result<String, String> {
        self.context
            .with(|ctx| ctx.eval::<String, _>(code))
            .map_err(|error| error.to_string())
    }
}

fn into_c_string(value: String) -> *mut c_char {
    CString::new(value)
        .expect("CString::new should not fail for generated strings")
        .into_raw()
}

#[no_mangle]
pub extern "C" fn eclipsa_native_quickjs_version() -> *mut c_char {
    into_c_string(env!("CARGO_PKG_VERSION").to_string())
}

#[no_mangle]
pub extern "C" fn eclipsa_native_quickjs_session_new() -> *mut QuickJsSession {
    match QuickJsSession::new() {
        Ok(session) => Box::into_raw(Box::new(session)),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn eclipsa_native_quickjs_session_free(session: *mut QuickJsSession) {
    if session.is_null() {
        return;
    }
    drop(Box::from_raw(session));
}

#[no_mangle]
pub unsafe extern "C" fn eclipsa_native_quickjs_eval(
    session: *mut QuickJsSession,
    code: *const c_char,
) -> *mut c_char {
    if session.is_null() || code.is_null() {
        return into_c_string("{\"ok\":false,\"value\":\"invalid input\"}".to_string());
    }

    let session = &*session;
    let _ = &session.runtime;
    let code = match CStr::from_ptr(code).to_str() {
        Ok(code) => code,
        Err(error) => {
            return into_c_string(format!("{{\"ok\":false,\"value\":{}}}", serde_json_string(&error.to_string())));
        }
    };

    match session.eval(code) {
        Ok(value) => into_c_string(format!(
            "{{\"ok\":true,\"value\":{}}}",
            serde_json_string(&value)
        )),
        Err(error) => into_c_string(format!(
            "{{\"ok\":false,\"value\":{}}}",
            serde_json_string(&error)
        )),
    }
}

#[no_mangle]
pub unsafe extern "C" fn eclipsa_native_quickjs_string_free(value: *mut c_char) {
    if value.is_null() {
        return;
    }
    drop(CString::from_raw(value));
}

fn serde_json_string(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{}\"", escaped)
}
