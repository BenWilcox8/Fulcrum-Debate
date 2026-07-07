//! Uploading a document to a [SpeechDrop](https://speechdrop.net) room.
//!
//! This is the Tauri/Rust **outbound network** boundary for the SpeechDrop
//! export target - the app's second export target, and the first that speaks a
//! protocol itself rather than handing a URL to the OS (contrast
//! [`super::external::open_external`], which only opens `mailto:`/`https:` URLs).
//!
//! ## Security posture (mirrors the `open_external` scheme allowlist)
//!
//! `open_external` constrains *what schemes* it will hand to the OS; this command
//! constrains *what host* it will talk to. The web side never passes a URL - it
//! passes only a room code plus the file - and the request URL is always built
//! from the fixed [`SPEECHDROP_BASE_URL`]. The room code is validated to a short
//! alphanumeric token ([`validate_room_code`]) so it can never inject a path
//! segment or a different host, and the content type is checked against
//! SpeechDrop's own upload allowlist ([`is_allowed_mime`]). The network boundary
//! can therefore only ever reach speechdrop.net, with a well-formed room code and
//! an accepted file type.
//!
//! ## The upload flow (SpeechDrop's real, CSRF-protected API)
//!
//! SpeechDrop protects its mutating routes with a Vert.x `CSRFHandler`: a GET
//! issues an `XSRF-TOKEN` cookie (paired with a `vertx-web.session` cookie), and
//! an upload POST must echo that token in an `X-XSRF-TOKEN` header while carrying
//! both cookies. So the upload is two requests on one cookie-jar client:
//!
//! 1. `GET  {base}/{room}/index` - primes the CSRF + session cookies and, as a
//!    bonus, tells us whether the room exists (a missing room returns 404, which
//!    we surface as a clear "room not found" so a mistyped code is actionable).
//! 2. `POST {base}/{room}/upload` - `multipart/form-data` with the file part,
//!    the `X-XSRF-TOKEN` header set to the primed token, and the cookie jar
//!    auto-replaying both cookies.
//!
//! The response is interpreted by [`classify_upload_response`] into a friendly
//! `Result<(), String>`; the `Err` string is surfaced by the web side as
//! non-intrusive export feedback (it never throws for an expected failure).

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;

/// The fixed SpeechDrop origin. The web side never supplies a URL, so the
/// network boundary can only ever reach this host (the host-allowlist analogue
/// of `open_external`'s scheme allowlist).
pub const SPEECHDROP_BASE_URL: &str = "https://speechdrop.net";

/// The name of the CSRF cookie SpeechDrop issues on a GET and validates (echoed
/// in the `X-XSRF-TOKEN` header) on a mutating POST.
const XSRF_COOKIE_NAME: &str = "XSRF-TOKEN";
const XSRF_HEADER_NAME: &str = "X-XSRF-TOKEN";

/// The MIME types SpeechDrop accepts for upload (mirrors its server's
/// `allowedMimeTypes`). Checked before we make any network call so a rejected
/// file type is reported immediately, not after a round trip.
const ALLOWED_MIMES: &[&str] = &[
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-word.document.macroEnabled.12",
    "application/vnd.oasis.opendocument.text",
    "application/x-iwork-pages-sffpages",
    "application/pdf",
    "text/plain",
    "text/rtf",
    "application/rtf",
    "text/richtext",
];

/// Whether `content_type` is a SpeechDrop-accepted upload MIME.
pub fn is_allowed_mime(content_type: &str) -> bool {
    ALLOWED_MIMES.contains(&content_type)
}

/// Validates a SpeechDrop room code and returns it trimmed.
///
/// Real codes are exactly six characters from an unambiguous alphanumeric set;
/// we accept any 1-12 char ASCII-alphanumeric string (case preserved, since the
/// codes are case-sensitive) and reject everything else. Rejecting non-alnum is
/// the security-critical part: it makes path/host injection into the fixed base
/// URL impossible.
pub fn validate_room_code(room_code: &str) -> Result<String, String> {
    let trimmed = room_code.trim();
    if trimmed.is_empty() {
        return Err("Enter a SpeechDrop room code.".to_string());
    }
    if trimmed.len() > 12 || !trimmed.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("\"{trimmed}\" is not a valid SpeechDrop room code."));
    }
    Ok(trimmed.to_string())
}

/// The upload request, mirrored by the `SpeechDropUploadRequest` interface in
/// `src/ipc`. The file content travels base64-encoded so the boundary is
/// binary-safe (RTF today, a future PDF/DOCX unchanged).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechDropUploadRequest {
    /// The room code the debater entered (validated server-side too).
    pub room_code: String,
    /// The file name to present to SpeechDrop (e.g. `"Speech.rtf"`).
    pub file_name: String,
    /// The upload MIME type (must be in [`ALLOWED_MIMES`]).
    pub content_type: String,
    /// The file bytes, base64-encoded.
    pub content_base64: String,
}

/// Maps a SpeechDrop upload response (its HTTP status + body) to a friendly
/// result. Pure, so it is unit-tested without a network. SpeechDrop returns 200
/// with the room index on success, 404 for a missing room, and 400 with a JSON
/// `{ "err": "bad_type" | "too_large" | "no_file" }` for a rejected upload.
pub fn classify_upload_response(status: u16, body: &str) -> Result<(), String> {
    match status {
        200 => Ok(()),
        404 => Err("That SpeechDrop room code wasn't found.".to_string()),
        400 => {
            let code = serde_json::from_str::<serde_json::Value>(body)
                .ok()
                .and_then(|v| v.get("err").and_then(|e| e.as_str()).map(str::to_string));
            Err(match code.as_deref() {
                Some("bad_type") => {
                    "SpeechDrop rejected the file type.".to_string()
                }
                Some("too_large") => {
                    "The document is too large for SpeechDrop (10 MB max).".to_string()
                }
                Some("no_file") => "No document was sent to SpeechDrop.".to_string(),
                _ => "SpeechDrop rejected the upload.".to_string(),
            })
        }
        other => Err(format!("SpeechDrop returned an unexpected status ({other}).")),
    }
}

/// Uploads a document to a SpeechDrop room.
///
/// Resolves `Ok(())` once SpeechDrop accepts the file, or `Err(message)` with a
/// human-readable reason for every *expected* failure (invalid room code,
/// unreachable host, room not found, rejected file) so the web side can surface
/// non-intrusive feedback rather than crashing.
#[tauri::command]
pub async fn speechdrop_upload(request: SpeechDropUploadRequest) -> Result<(), String> {
    let room = validate_room_code(&request.room_code)?;
    if !is_allowed_mime(&request.content_type) {
        return Err("SpeechDrop does not accept this file type.".to_string());
    }
    let bytes = STANDARD
        .decode(request.content_base64.as_bytes())
        .map_err(|_| "The document could not be encoded for upload.".to_string())?;

    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .map_err(|e| format!("Could not start the upload. {e}"))?;

    // 1. Prime the CSRF + session cookies (and check the room exists).
    let index_url = format!("{SPEECHDROP_BASE_URL}/{room}/index");
    let index_res = client
        .get(&index_url)
        .send()
        .await
        .map_err(|_| "Could not reach SpeechDrop. Check your connection.".to_string())?;
    if index_res.status().as_u16() == 404 {
        return Err("That SpeechDrop room code wasn't found.".to_string());
    }

    let token = index_res
        .cookies()
        .find(|c| c.name() == XSRF_COOKIE_NAME)
        .map(|c| c.value().to_string())
        .ok_or_else(|| "SpeechDrop did not issue a session. Try again.".to_string())?;

    // 2. Upload the file, echoing the CSRF token; the cookie jar replays both
    //    cookies automatically.
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(request.file_name)
        .mime_str(&request.content_type)
        .map_err(|_| "SpeechDrop does not accept this file type.".to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);

    let upload_url = format!("{SPEECHDROP_BASE_URL}/{room}/upload");
    let upload_res = client
        .post(&upload_url)
        .header(XSRF_HEADER_NAME, token)
        .multipart(form)
        .send()
        .await
        .map_err(|_| "Could not reach SpeechDrop. Check your connection.".to_string())?;

    let status = upload_res.status().as_u16();
    let body = upload_res.text().await.unwrap_or_default();
    classify_upload_response(status, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_room_code_accepts_a_six_char_alnum_code() {
        assert_eq!(validate_room_code("aB3dEf").unwrap(), "aB3dEf");
    }

    #[test]
    fn validate_room_code_trims_surrounding_whitespace() {
        assert_eq!(validate_room_code("  aB3dEf  ").unwrap(), "aB3dEf");
    }

    #[test]
    fn validate_room_code_rejects_empty() {
        assert!(validate_room_code("   ").is_err());
    }

    #[test]
    fn validate_room_code_rejects_path_and_host_injection() {
        assert!(validate_room_code("../abc").is_err());
        assert!(validate_room_code("a/b").is_err());
        assert!(validate_room_code("a.evil.com").is_err());
        assert!(validate_room_code("a b").is_err());
    }

    #[test]
    fn validate_room_code_rejects_overlong() {
        assert!(validate_room_code("abcdefghijklm").is_err());
    }

    #[test]
    fn is_allowed_mime_matches_speechdrop_allowlist() {
        assert!(is_allowed_mime("text/rtf"));
        assert!(is_allowed_mime("application/pdf"));
        assert!(is_allowed_mime("text/plain"));
        assert!(!is_allowed_mime("text/html"));
        assert!(!is_allowed_mime("image/png"));
    }

    #[test]
    fn classify_upload_response_ok_on_200() {
        assert!(classify_upload_response(200, "[]").is_ok());
    }

    #[test]
    fn classify_upload_response_maps_404_to_room_not_found() {
        let err = classify_upload_response(404, "").unwrap_err();
        assert!(err.contains("room code"));
    }

    #[test]
    fn classify_upload_response_maps_400_err_codes() {
        assert!(classify_upload_response(400, r#"{"err":"bad_type"}"#)
            .unwrap_err()
            .contains("file type"));
        assert!(classify_upload_response(400, r#"{"err":"too_large"}"#)
            .unwrap_err()
            .contains("too large"));
        assert!(classify_upload_response(400, r#"{"err":"no_file"}"#)
            .unwrap_err()
            .contains("No document"));
        // Unrecognized / unparseable 400 bodies still produce a message.
        assert!(classify_upload_response(400, "not json").is_err());
    }

    #[test]
    fn classify_upload_response_reports_unexpected_status() {
        assert!(classify_upload_response(500, "").unwrap_err().contains("500"));
    }
}
