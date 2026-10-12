use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{multipart, Client, Response, Url};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub base_url: String,
    pub text_model: String,
    pub image_model: String,
    pub speech_model: String,
}

pub fn validate_url(base: &str) -> Result<Url, String> {
    let url = Url::parse(base).map_err(|_| "Enter a valid AI API base URL in Settings.")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if url.scheme() != "https" && !(local && url.scheme() == "http") {
        return Err("Use HTTPS for remote AI providers, or HTTP for localhost.".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "API base URL cannot contain credentials, query parameters, or fragments.".into(),
        );
    }
    Ok(url)
}

pub fn credential(base: &str) -> Result<keyring::Entry, String> {
    let url = validate_url(base)?;
    let account = format!("provider:{}", url.as_str().trim_end_matches('/'));
    keyring::Entry::new("com.folio.cv", &account).map_err(|error| error.to_string())
}

pub fn api_key(provider: &Provider) -> Result<String, String> {
    match credential(&provider.base_url)?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(format!("Cannot access saved API key: {error}")),
    }
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(150))
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())
}

fn endpoint(provider: &Provider, suffix: &str) -> Result<String, String> {
    validate_url(&provider.base_url)?;
    Ok(format!(
        "{}/{}",
        provider.base_url.trim_end_matches('/'),
        suffix
    ))
}

async fn response_json(mut response: Response) -> Result<Value, String> {
    let status = response.status();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if body.len() + chunk.len() > 24 * 1024 * 1024 {
            return Err("AI response exceeded the 24 MB limit.".into());
        }
        body.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        return Err(format!("AI provider returned HTTP {}. Check your endpoint, key, model access, and account quota.", status.as_u16()));
    }
    serde_json::from_slice(&body)
        .map_err(|_| "The provider returned an unexpected response format.".into())
}

pub async fn text(provider: Provider, prompt: String) -> Result<String, String> {
    if provider.text_model.trim().is_empty() {
        return Err("Set a text model in Settings first.".into());
    }
    if prompt.len() > 200_000 {
        return Err("The CV text is too large for this request.".into());
    }
    let response = client()?.post(endpoint(&provider, "chat/completions")?).bearer_auth(api_key(&provider)?).json(&json!({"model":provider.text_model,"messages":[{"role":"system","content":"You help people write truthful, concise CVs. Never invent facts. Return plain text only."},{"role":"user","content":prompt}]})).send().await.map_err(|error| error.to_string())?;
    let value = response_json(response).await?;
    value["choices"][0]["message"]["content"]
        .as_str()
        .filter(|text| !text.trim().is_empty())
        .map(str::to_owned)
        .ok_or("The text model returned no content.".into())
}

pub async fn portrait(provider: Provider, photo: String, outfit: String) -> Result<String, String> {
    if provider.image_model.trim().is_empty() {
        return Err("Set an image edit model in Settings first.".into());
    }
    let (header, data) = photo.split_once(',').ok_or("Invalid portrait data")?;
    let (mime, name) = match header {
        "data:image/jpeg;base64" => ("image/jpeg", "portrait.jpg"),
        "data:image/png;base64" => ("image/png", "portrait.png"),
        "data:image/webp;base64" => ("image/webp", "portrait.webp"),
        _ => return Err("Use a PNG, JPEG, or WebP portrait.".into()),
    };
    if data.len() > 16 * 1024 * 1024 {
        return Err("Portrait exceeds the size limit.".into());
    }
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "Invalid portrait encoding")?;
    let image = multipart::Part::bytes(bytes)
        .file_name(name)
        .mime_str(mime)
        .map_err(|error| error.to_string())?;
    let form = multipart::Form::new().text("model", provider.image_model.clone()).text("prompt", format!("Edit this person's portrait into a realistic professional CV headshot. Preserve the exact person, facial identity, age, skin tone, facial features, and natural appearance. Change only clothing to {outfit}, use a clean light neutral studio background and soft natural lighting. Head and shoulders, no text, no logos, no beauty retouching.")).part("image", image);
    let response = client()?
        .post(endpoint(&provider, "images/edits")?)
        .bearer_auth(api_key(&provider)?)
        .multipart(form)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let value = response_json(response).await?;
    let encoded = value["data"][0]["b64_json"].as_str().ok_or(
        "The image provider must return data[0].b64_json; URL-only responses are not supported.",
    )?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "The provider returned invalid image data")?;
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return Err("The provider returned an unsupported image format.".into());
    };
    Ok(format!("data:{mime};base64,{encoded}"))
}

pub async fn transcribe(
    provider: Provider,
    bytes: Vec<u8>,
    mime: String,
) -> Result<String, String> {
    if provider.speech_model.trim().is_empty() {
        return Err("Set a transcription model in Settings first.".into());
    }
    if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
        return Err("Audio must be nonempty and smaller than 20 MB.".into());
    }
    let content_type = mime.split(';').next().unwrap_or("audio/webm");
    let filename = match content_type {
        "audio/webm" | "video/webm" => "answer.webm",
        "audio/ogg" => "answer.ogg",
        "audio/mp4" => "answer.m4a",
        "audio/wav" | "audio/x-wav" => "answer.wav",
        _ => return Err("This recording format is not supported.".into()),
    };
    let part = multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(content_type)
        .map_err(|error| error.to_string())?;
    let form = multipart::Form::new()
        .text("model", provider.speech_model.clone())
        .part("file", part);
    let response = client()?
        .post(endpoint(&provider, "audio/transcriptions")?)
        .bearer_auth(api_key(&provider)?)
        .multipart(form)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let value = response_json(response).await?;
    value["text"]
        .as_str()
        .filter(|text| !text.trim().is_empty())
        .map(str::to_owned)
        .ok_or("No speech was detected. Try again or type your answer.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_only_go_to_secure_or_loopback_endpoints() {
        assert!(validate_url("https://api.example.com/v1").is_ok());
        assert!(validate_url("http://localhost:8080/v1").is_ok());
        assert!(validate_url("http://api.example.com/v1").is_err());
        assert!(validate_url("https://user:pass@example.com/v1").is_err());
        assert!(validate_url("https://example.com/v1?key=secret").is_err());
        assert!(validate_url("file:///tmp/provider").is_err());
    }
}
