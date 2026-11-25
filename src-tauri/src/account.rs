//! Ada accounts on the shared Supabase project.
//!
//! Network calls happen here, in Rust, so the web view never needs network access. The
//! refresh token lives in Windows Credential Manager. `account.json` only remembers which
//! account this PC is signed in to, so the right local workspace opens offline.

use crate::store::{Counts, Store};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

const OFFLINE: &str =
    "Ada couldn't reach the account service. Check your connection. Your work is still saved on this PC.";
const NOT_CONFIGURED: &str =
    "This copy of Ada isn't connected to an account service yet. Your work stays on this PC.";

pub struct Failure {
    pub code: String,
    pub message: String,
}

impl From<Failure> for String {
    fn from(failure: Failure) -> Self {
        failure.message
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct User {
    pub id: String,
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Deserialize)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    pub user: User,
}

pub enum SignUp {
    Session(Session),
    Verify,
}

pub struct Service {
    base: String,
    key: String,
    agent: ureq::Agent,
}

fn setting(name: &str, built: Option<&'static str>) -> Option<String> {
    std::env::var(name)
        .ok()
        .or(built.map(str::to_owned))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

impl Service {
    /// Reads the project URL and publishable key supplied when Ada was built, or at run time
    /// for development. Both are public values; no secret is ever built into Ada.
    pub fn from_env() -> Option<Self> {
        Self::new(
            &setting("ADA_SUPABASE_URL", option_env!("ADA_SUPABASE_URL"))?,
            &setting(
                "ADA_SUPABASE_PUBLISHABLE_KEY",
                option_env!("ADA_SUPABASE_PUBLISHABLE_KEY"),
            )?,
        )
    }

    pub fn new(url: &str, key: &str) -> Option<Self> {
        let base = url.trim_end_matches('/').to_owned();
        let local = base.starts_with("http://127.0.0.1:") || base.starts_with("http://localhost:");
        if !(base.starts_with("https://") || local) {
            return None;
        }
        Some(Self {
            base,
            key: key.to_owned(),
            agent: ureq::AgentBuilder::new()
                .timeout(Duration::from_secs(20))
                .build(),
        })
    }

    fn call(
        &self,
        method: &str,
        path: &str,
        bearer: Option<&str>,
        body: Value,
    ) -> Result<Value, Failure> {
        let mut request = self
            .agent
            .request(method, &format!("{}{path}", self.base))
            .set("apikey", &self.key)
            .set("Accept", "application/json");
        if let Some(token) = bearer {
            request = request.set("Authorization", &format!("Bearer {token}"));
        }
        match request.send_json(body) {
            Ok(response) => {
                let text = response
                    .into_string()
                    .map_err(|_| failure("network", OFFLINE))?;
                if text.trim().is_empty() {
                    Ok(Value::Null)
                } else {
                    serde_json::from_str(&text).map_err(|_| {
                        failure(
                            "response",
                            "The account service sent a reply Ada couldn't read.",
                        )
                    })
                }
            }
            Err(ureq::Error::Status(status, response)) => Err(explain(
                status,
                &response.into_json().unwrap_or(Value::Null),
            )),
            Err(ureq::Error::Transport(_)) => Err(failure("network", OFFLINE)),
        }
    }

    fn session(value: Value) -> Result<Session, Failure> {
        serde_json::from_value(value).map_err(|_| {
            failure(
                "response",
                "The account service sent a reply Ada couldn't read.",
            )
        })
    }

    pub fn sign_up(&self, email: &str, password: &str) -> Result<SignUp, Failure> {
        let reply = self.call(
            "POST",
            "/auth/v1/signup",
            None,
            json!({ "email": email, "password": password }),
        )?;
        // Projects that require email confirmation answer with the new user and no session.
        if reply.get("access_token").is_some() {
            Ok(SignUp::Session(Self::session(reply)?))
        } else {
            Ok(SignUp::Verify)
        }
    }

    pub fn sign_in(&self, email: &str, password: &str) -> Result<Session, Failure> {
        Self::session(self.call(
            "POST",
            "/auth/v1/token?grant_type=password",
            None,
            json!({ "email": email, "password": password }),
        )?)
    }

    pub fn verify(&self, email: &str, code: &str, kind: &str) -> Result<Session, Failure> {
        Self::session(self.call(
            "POST",
            "/auth/v1/verify",
            None,
            json!({ "type": kind, "email": email, "token": code }),
        )?)
    }

    pub fn resend(&self, email: &str) -> Result<(), Failure> {
        self.call(
            "POST",
            "/auth/v1/resend",
            None,
            json!({ "type": "signup", "email": email }),
        )
        .map(drop)
    }

    pub fn recover(&self, email: &str) -> Result<(), Failure> {
        self.call("POST", "/auth/v1/recover", None, json!({ "email": email }))
            .map(drop)
    }

    pub fn refresh(&self, token: &str) -> Result<Session, Failure> {
        Self::session(self.call(
            "POST",
            "/auth/v1/token?grant_type=refresh_token",
            None,
            json!({ "refresh_token": token }),
        )?)
    }

    pub fn set_password(&self, access: &str, password: &str) -> Result<(), Failure> {
        self.call(
            "PUT",
            "/auth/v1/user",
            Some(access),
            json!({ "password": password }),
        )
        .map(drop)
    }

    pub fn sign_out(&self, access: &str) -> Result<(), Failure> {
        self.call(
            "POST",
            "/auth/v1/logout?scope=local",
            Some(access),
            json!({}),
        )
        .map(drop)
    }

    pub fn delete_account(&self, access: &str) -> Result<(), Failure> {
        self.call(
            "POST",
            "/rest/v1/rpc/delete_own_account",
            Some(access),
            json!({}),
        )
        .map(drop)
    }
}

fn failure(code: &str, message: &str) -> Failure {
    Failure {
        code: code.into(),
        message: message.into(),
    }
}

fn explain(status: u16, body: &Value) -> Failure {
    let text = |key: &str| body.get(key).and_then(Value::as_str).map(str::to_owned);
    let code = text("error_code")
        .or_else(|| text("code").filter(|code| code.parse::<u16>().is_err()))
        .or_else(|| text("error"))
        .unwrap_or_default();
    let detail = text("msg")
        .or_else(|| text("message"))
        .or_else(|| text("error_description"));
    let message = match code.as_str() {
        "invalid_credentials" | "invalid_grant" => {
            "That email and password don't match an Ada account.".to_owned()
        }
        "email_not_confirmed" => {
            "Confirm your email address first. Enter the code from the email Ada sent.".to_owned()
        }
        "user_already_exists" | "email_exists" => {
            "An account already uses that email. Sign in instead.".to_owned()
        }
        "weak_password" => format!(
            "Choose a stronger password.{}",
            detail.map(|detail| format!(" {detail}")).unwrap_or_default()
        ),
        "same_password" => "Choose a password you haven't used for this account.".to_owned(),
        "otp_expired" => "That code is incorrect or has expired. Request a new one.".to_owned(),
        "signup_disabled" | "email_provider_disabled" => {
            "New accounts can't be created right now.".to_owned()
        }
        "email_address_invalid" => "Check the email address and try again.".to_owned(),
        "user_not_found" => "That account no longer exists.".to_owned(),
        "session_not_found" | "refresh_token_not_found" | "refresh_token_already_used" => {
            "Your sign-in has expired. Sign in again.".to_owned()
        }
        "over_email_send_rate_limit" | "over_request_rate_limit" | "over_sms_send_rate_limit" => {
            "Too many attempts. Wait a minute, then try again.".to_owned()
        }
        _ if status == 429 => "Too many attempts. Wait a minute, then try again.".to_owned(),
        _ if status >= 500 => {
            "The account service is having trouble. Try again later. Your work is still saved on this PC."
                .to_owned()
        }
        _ => detail.unwrap_or_else(|| format!("The account service declined the request ({status}).")),
    };
    Failure { code, message }
}

/// Where refresh tokens are kept between launches.
pub trait Vault: Send {
    fn save(&self, account: &str, secret: &str) -> Result<(), String>;
    fn load(&self, account: &str) -> Option<String>;
    fn clear(&self, account: &str);
}

pub struct CredentialManager;

impl CredentialManager {
    fn entry(account: &str) -> Option<keyring::Entry> {
        keyring::Entry::new("com.projectgloria.ada", account).ok()
    }
}

impl Vault for CredentialManager {
    fn save(&self, account: &str, secret: &str) -> Result<(), String> {
        Self::entry(account)
            .and_then(|entry| entry.set_password(secret).ok())
            .ok_or_else(|| "Windows couldn't store your sign-in securely.".to_owned())
    }

    fn load(&self, account: &str) -> Option<String> {
        Self::entry(account)?.get_password().ok()
    }

    fn clear(&self, account: &str) {
        if let Some(entry) = Self::entry(account) {
            let _ = entry.delete_credential();
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    current: Option<User>,
    #[serde(default)]
    kept_separate: Vec<String>,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Request {
    Read,
    SignUp { email: String, password: String },
    SignIn { email: String, password: String },
    Verify { email: String, code: String },
    Resend { email: String },
    Recover { email: String },
    VerifyRecovery { email: String, code: String },
    SetPassword { password: String },
    ChooseMerge { merge: bool },
    CancelMerge,
    SignOut,
    Delete { password: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    configured: bool,
    demo: bool,
    email: Option<String>,
    merge: Option<Counts>,
    recovering: bool,
    /// What the account dialog should show next.
    step: &'static str,
    /// True when the open workspace changed and the window should reload it.
    reload: bool,
}

pub struct Accounts {
    root: PathBuf,
    demo: bool,
    service: Option<Service>,
    vault: Box<dyn Vault>,
    saved: Saved,
    pending: Option<Session>,
    recovering: Option<Session>,
}

fn valid_email(email: &str) -> Result<String, String> {
    let email = email.trim().to_lowercase();
    let (name, domain) = email.split_once('@').unwrap_or_default();
    if email.len() > 254
        || name.is_empty()
        || !domain.contains('.')
        || email.contains(char::is_whitespace)
    {
        return Err("Enter a valid email address.".into());
    }
    Ok(email)
}

fn valid_password(password: &str) -> Result<(), String> {
    match password.chars().count() {
        0..=7 => Err("Use at least 8 characters for your password.".into()),
        73.. => Err("Use at most 72 characters for your password.".into()),
        _ => Ok(()),
    }
}

fn valid_code(code: &str) -> Result<String, String> {
    let code: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    if (6..=10).contains(&code.len()) && code.chars().all(|c| c.is_ascii_digit()) {
        Ok(code)
    } else {
        Err("Enter the code from the email, using digits only.".into())
    }
}

impl Accounts {
    pub fn load(root: &Path, demo: bool, service: Option<Service>, vault: Box<dyn Vault>) -> Self {
        let saved = fs::read(root.join("account.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
            .filter(|saved| saved.current.as_ref().is_none_or(|user| safe_id(&user.id)))
            .unwrap_or_default();
        Self {
            root: root.to_owned(),
            demo,
            service,
            vault,
            saved,
            pending: None,
            recovering: None,
        }
    }

    pub fn guest_path(&self) -> PathBuf {
        self.root.join(if self.demo {
            "demo.sqlite3"
        } else {
            "ada.sqlite3"
        })
    }

    fn account_path(&self, user: &User) -> PathBuf {
        self.root.join(format!("account-{}.sqlite3", user.id))
    }

    /// The workspace to open: the signed-in account's, or the guest workspace.
    pub fn workspace_path(&self) -> PathBuf {
        match (&self.saved.current, self.demo) {
            (Some(user), false) => self.account_path(user),
            _ => self.guest_path(),
        }
    }

    fn persist(&self) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(&self.saved).map_err(|error| error.to_string())?;
        let temporary = self.root.join("account.json.tmp");
        fs::write(&temporary, bytes)
            .and_then(|_| fs::rename(&temporary, self.root.join("account.json")))
            .map_err(|_| "Ada couldn't save your sign-in on this PC.".to_owned())
    }

    fn view(&self, step: &'static str, reload: bool, store: Option<&Store>) -> View {
        View {
            configured: self.service.is_some(),
            demo: self.demo,
            email: self
                .saved
                .current
                .as_ref()
                .and_then(|user| user.email.clone()),
            merge: self
                .pending
                .as_ref()
                .and_then(|_| store.and_then(|store| store.counts().ok())),
            recovering: self.recovering.is_some(),
            step,
            reload,
        }
    }

    fn service(&self) -> Result<&Service, String> {
        if self.demo {
            return Err(
                "The sample week can't be linked to an account. Open Ada normally to sign in."
                    .into(),
            );
        }
        self.service
            .as_ref()
            .ok_or_else(|| NOT_CONFIGURED.to_owned())
    }

    fn guard_idle(store: &Mutex<Store>, message: &str) -> Result<(), String> {
        let busy = lock(store)?
            .has_active_session()
            .map_err(|error| error.to_string())?;
        if busy {
            Err(message.into())
        } else {
            Ok(())
        }
    }

    pub fn handle(&mut self, request: Request, store: &Mutex<Store>) -> Result<View, String> {
        let before_sign_in = "Finish your current focus session before signing in.";
        match request {
            Request::Read => {
                let guard = lock(store)?;
                Ok(self.view(
                    if self.pending.is_some() {
                        "merge"
                    } else {
                        "idle"
                    },
                    false,
                    Some(&*guard),
                ))
            }
            Request::SignUp { email, password } => {
                self.require_signed_out()?;
                let email = valid_email(&email)?;
                valid_password(&password)?;
                Self::guard_idle(store, before_sign_in)?;
                match self.service()?.sign_up(&email, &password)? {
                    SignUp::Session(session) => self.land(session, store),
                    SignUp::Verify => Ok(self.view("verify", false, None)),
                }
            }
            Request::SignIn { email, password } => {
                self.require_signed_out()?;
                let email = valid_email(&email)?;
                if password.is_empty() {
                    return Err("Enter your password.".into());
                }
                Self::guard_idle(store, before_sign_in)?;
                match self.service()?.sign_in(&email, &password) {
                    Ok(session) => self.land(session, store),
                    Err(failure) if failure.code == "email_not_confirmed" => {
                        // Send a fresh code; the earlier one may have expired.
                        let _ = self.service()?.resend(&email);
                        Ok(self.view("verify", false, None))
                    }
                    Err(failure) => Err(failure.into()),
                }
            }
            Request::Verify { email, code } => {
                self.require_signed_out()?;
                let (email, code) = (valid_email(&email)?, valid_code(&code)?);
                Self::guard_idle(store, before_sign_in)?;
                let session = self.service()?.verify(&email, &code, "signup")?;
                self.land(session, store)
            }
            Request::Resend { email } => {
                self.service()?.resend(&valid_email(&email)?)?;
                Ok(self.view("verify", false, None))
            }
            Request::Recover { email } => {
                self.service()?.recover(&valid_email(&email)?)?;
                Ok(self.view("recoveryCode", false, None))
            }
            Request::VerifyRecovery { email, code } => {
                let (email, code) = (valid_email(&email)?, valid_code(&code)?);
                let session = self.service()?.verify(&email, &code, "recovery")?;
                self.recovering = Some(session);
                Ok(self.view("newPassword", false, None))
            }
            Request::SetPassword { password } => {
                valid_password(&password)?;
                if let Some(session) = self.recovering.take() {
                    if let Err(error) = self
                        .service()?
                        .set_password(&session.access_token, &password)
                    {
                        self.recovering = Some(session);
                        return Err(error.into());
                    }
                    if self.saved.current.as_ref() == Some(&session.user) {
                        self.vault.save(&session.user.id, &session.refresh_token)?;
                        return Ok(self.view("passwordChanged", false, None));
                    }
                    if self.saved.current.is_some() {
                        // Recovered a different account while signed in: keep the current sign-in.
                        return Ok(self.view("passwordChanged", false, None));
                    }
                    Self::guard_idle(store, before_sign_in)?;
                    return self.land(session, store);
                }
                let access = self.access()?;
                self.service()?.set_password(&access, &password)?;
                Ok(self.view("passwordChanged", false, None))
            }
            Request::ChooseMerge { merge } => {
                let session = self
                    .pending
                    .take()
                    .ok_or("Sign in again to choose what happens to this PC's work.")?;
                if let Err(error) = self.activate(session.user.clone(), merge, store) {
                    self.pending = Some(session);
                    return Err(error);
                }
                Ok(self.view("signedIn", true, None))
            }
            Request::CancelMerge => {
                if let Some(session) = self.pending.take() {
                    if let Ok(service) = self.service() {
                        let _ = service.sign_out(&session.access_token);
                    }
                    self.vault.clear(&session.user.id);
                }
                Ok(self.view("idle", false, None))
            }
            Request::SignOut => {
                let user = self.saved.current.clone().ok_or("You're not signed in.")?;
                Self::guard_idle(
                    store,
                    "Finish your current focus session before signing out.",
                )?;
                // Signing out on this PC always succeeds, even offline.
                if let Ok(access) = self.access() {
                    let _ = self.service()?.sign_out(&access);
                }
                self.vault.clear(&user.id);
                self.saved.current = None;
                self.persist()?;
                self.switch(store, self.guest_path())?;
                Ok(self.view("signedOut", true, None))
            }
            Request::Delete { password } => {
                let user = self.saved.current.clone().ok_or("You're not signed in.")?;
                let email = user
                    .email
                    .clone()
                    .ok_or("Sign in again before deleting your account.")?;
                Self::guard_idle(
                    store,
                    "Finish your current focus session before deleting your account.",
                )?;
                // Confirming the password also proves the person at this PC owns the account.
                let session = self.service()?.sign_in(&email, &password)?;
                if session.user.id != user.id {
                    return Err("That password belongs to a different account.".into());
                }
                self.service()?.delete_account(&session.access_token)?;
                // The account is gone; keep its work on this PC as the local workspace.
                let account_path = self.account_path(&user);
                let mut guest =
                    Store::open(self.guest_path(), false).map_err(|error| error.to_string())?;
                guest
                    .absorb(&account_path)
                    .map_err(|error| error.to_string())?;
                *lock(store)? = guest;
                for suffix in ["", "-wal", "-shm"] {
                    let _ = fs::remove_file(format!("{}{suffix}", account_path.display()));
                }
                self.vault.clear(&user.id);
                self.saved.current = None;
                self.saved.kept_separate.retain(|id| id != &user.id);
                self.persist()?;
                Ok(self.view("deleted", true, None))
            }
        }
    }

    fn require_signed_out(&self) -> Result<(), String> {
        if self.saved.current.is_some() {
            Err("Sign out before using a different account.".into())
        } else {
            Ok(())
        }
    }

    /// A fresh access token for the signed-in account, from the stored refresh token.
    fn access(&mut self) -> Result<String, String> {
        let user = self.saved.current.clone().ok_or("You're not signed in.")?;
        let token = self
            .vault
            .load(&user.id)
            .ok_or("Your sign-in has expired. Sign in again.")?;
        let session = self.service()?.refresh(&token)?;
        self.vault.save(&user.id, &session.refresh_token)?;
        Ok(session.access_token)
    }

    /// Finishes signing in: asks about this PC's guest work if there is any, otherwise opens
    /// the account's workspace.
    fn land(&mut self, session: Session, store: &Mutex<Store>) -> Result<View, String> {
        if !safe_id(&session.user.id) {
            return Err("The account service sent a reply Ada couldn't read.".into());
        }
        self.vault.save(&session.user.id, &session.refresh_token)?;
        let guest = lock(store)?.counts().map_err(|error| error.to_string())?;
        if !guest.is_empty() && !self.saved.kept_separate.contains(&session.user.id) {
            self.pending = Some(session);
            let guard = lock(store)?;
            return Ok(self.view("merge", false, Some(&*guard)));
        }
        self.activate(session.user, false, store)?;
        Ok(self.view("signedIn", true, None))
    }

    fn activate(&mut self, user: User, merge: bool, store: &Mutex<Store>) -> Result<(), String> {
        Self::guard_idle(
            store,
            "Finish your current focus session before signing in.",
        )?;
        let mut account =
            Store::open(self.account_path(&user), false).map_err(|error| error.to_string())?;
        if merge {
            account
                .absorb(&self.guest_path())
                .map_err(|error| crate::store::describe(&*error))?;
        } else if !self.saved.kept_separate.contains(&user.id) {
            self.saved.kept_separate.push(user.id.clone());
        }
        self.saved.current = Some(user);
        self.persist()?;
        *lock(store)? = account;
        Ok(())
    }

    fn switch(&self, store: &Mutex<Store>, path: PathBuf) -> Result<(), String> {
        let next = Store::open(path, self.demo).map_err(|error| error.to_string())?;
        *lock(store)? = next;
        Ok(())
    }
}

fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn lock(store: &Mutex<Store>) -> Result<std::sync::MutexGuard<'_, Store>, String> {
    store
        .lock()
        .map_err(|_| "Ada could not access its local database.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Action;
    use std::{
        collections::HashMap,
        io::{BufRead, BufReader, Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex as StdMutex},
        thread,
    };

    type Log = Arc<StdMutex<Vec<(String, String, Value)>>>;

    /// A stand-in for the account service that answers each path with a canned reply.
    fn server(routes: Vec<(&'static str, u16, Value)>) -> (String, Log) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let log: Log = Arc::default();
        let seen = log.clone();
        let routes: HashMap<_, _> = routes
            .into_iter()
            .map(|(path, status, body)| (path, (status, body)))
            .collect();
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let target = line
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or_default()
                    .to_owned();
                let (mut length, mut apikey) = (0, String::new());
                loop {
                    let mut header = String::new();
                    reader.read_line(&mut header).unwrap();
                    if header.trim().is_empty() {
                        break;
                    }
                    let (name, value) = header.split_once(':').unwrap();
                    match name.to_ascii_lowercase().as_str() {
                        "content-length" => length = value.trim().parse().unwrap(),
                        "apikey" => apikey = value.trim().to_owned(),
                        _ => {}
                    }
                }
                let mut body = vec![0; length];
                reader.read_exact(&mut body).unwrap();
                let body = serde_json::from_slice(&body).unwrap_or(Value::Null);
                seen.lock().unwrap().push((target.clone(), apikey, body));
                let path = target.split('?').next().unwrap();
                let key = if target.contains("grant_type=refresh_token") {
                    "refresh"
                } else {
                    path
                };
                let (status, reply) = routes.get(key).cloned().unwrap_or((404, json!({})));
                let reply = reply.to_string();
                write!(
                    stream,
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
                    reply.len()
                )
                .unwrap();
            }
        });
        (address, log)
    }

    #[derive(Default, Clone)]
    struct Memory(Arc<StdMutex<HashMap<String, String>>>);

    impl Vault for Memory {
        fn save(&self, account: &str, secret: &str) -> Result<(), String> {
            self.0.lock().unwrap().insert(account.into(), secret.into());
            Ok(())
        }
        fn load(&self, account: &str) -> Option<String> {
            self.0.lock().unwrap().get(account).cloned()
        }
        fn clear(&self, account: &str) {
            self.0.lock().unwrap().remove(account);
        }
    }

    fn session(id: &str) -> Value {
        json!({ "access_token": "access", "refresh_token": "refresh-1", "user": { "id": id, "email": "ada@example.com" } })
    }

    fn directory() -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "ada-account-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        fs::create_dir(&directory).unwrap();
        directory
    }

    #[test]
    fn service_errors_become_plain_guidance() {
        let (url, log) = server(vec![
            (
                "/auth/v1/token",
                400,
                json!({ "code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials" }),
            ),
            (
                "/auth/v1/signup",
                200,
                json!({ "id": "abc", "email": "ada@example.com" }),
            ),
            (
                "/auth/v1/recover",
                429,
                json!({ "code": 429, "error_code": "over_email_send_rate_limit" }),
            ),
        ]);
        let service = Service::new(&url, "sb_publishable_test").unwrap();
        let error = service
            .sign_in("ada@example.com", "wrong-password")
            .err()
            .unwrap();
        assert_eq!(
            error.message,
            "That email and password don't match an Ada account."
        );
        assert!(matches!(
            service.sign_up("ada@example.com", "a-long-password"),
            Ok(SignUp::Verify)
        ));
        assert!(service
            .recover("ada@example.com")
            .err()
            .unwrap()
            .message
            .starts_with("Too many attempts"));
        let log = log.lock().unwrap();
        assert_eq!(log[0].0, "/auth/v1/token?grant_type=password");
        assert_eq!(log[0].1, "sb_publishable_test");
        assert_eq!(log[0].2["email"], "ada@example.com");

        assert!(
            Service::new("http://example.com", "key").is_none(),
            "plain HTTP is refused"
        );
        let offline = Service::new("http://127.0.0.1:9", "key").unwrap();
        assert_eq!(
            offline.recover("ada@example.com").err().unwrap().message,
            OFFLINE
        );
    }

    #[test]
    fn signing_in_offers_to_merge_guest_work_then_signing_out_returns_to_it() {
        let (url, log) = server(vec![
            ("/auth/v1/token", 200, session("0b5c-user")),
            ("refresh", 200, session("0b5c-user")),
            ("/auth/v1/logout", 204, Value::Null),
        ]);
        let root = directory();
        let vault = Memory::default();
        let mut accounts = Accounts::load(
            &root,
            false,
            Service::new(&url, "key"),
            Box::new(vault.clone()),
        );
        let now = chrono::Utc::now().timestamp_millis();
        let store = Mutex::new(Store::open(accounts.workspace_path(), false).unwrap());
        store
            .lock()
            .unwrap()
            .apply(Action::AddTag {
                name: "Reading".into(),
            })
            .unwrap();
        let _ = now;

        let error = accounts.handle(
            Request::SignIn {
                email: "not an email".into(),
                password: "x".into(),
            },
            &store,
        );
        assert_eq!(error.err().unwrap(), "Enter a valid email address.");

        let view = accounts
            .handle(
                Request::SignIn {
                    email: " Ada@Example.com ".into(),
                    password: "correct-horse".into(),
                },
                &store,
            )
            .unwrap();
        assert_eq!(view.step, "merge");
        assert_eq!(view.merge.unwrap().tags, 1);
        assert_eq!(log.lock().unwrap()[0].2["email"], "ada@example.com");

        let view = accounts
            .handle(Request::ChooseMerge { merge: true }, &store)
            .unwrap();
        assert!(view.reload);
        assert_eq!(view.email.as_deref(), Some("ada@example.com"));
        assert!(root.join("account-0b5c-user.sqlite3").exists());
        assert_eq!(store.lock().unwrap().counts().unwrap().tags, 1);
        assert_eq!(vault.load("0b5c-user").as_deref(), Some("refresh-1"));

        // A relaunch opens the account's workspace from account.json, offline.
        let relaunched = Accounts::load(&root, false, None, Box::new(Memory::default()));
        assert_eq!(
            relaunched.workspace_path(),
            root.join("account-0b5c-user.sqlite3")
        );

        let view = accounts.handle(Request::SignOut, &store).unwrap();
        assert!(view.reload && view.email.is_none());
        assert!(vault.load("0b5c-user").is_none());
        assert!(
            store.lock().unwrap().counts().unwrap().is_empty(),
            "merged work left the guest workspace"
        );
        assert!(log
            .lock()
            .unwrap()
            .iter()
            .any(|(path, _, _)| path.starts_with("/auth/v1/logout")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unconfirmed_accounts_are_sent_to_the_code_step() {
        let (url, log) = server(vec![
            (
                "/auth/v1/token",
                400,
                json!({ "error_code": "email_not_confirmed", "msg": "Email not confirmed" }),
            ),
            ("/auth/v1/resend", 200, json!({})),
            ("/auth/v1/verify", 200, session("feed")),
        ]);
        let root = directory();
        let mut accounts = Accounts::load(
            &root,
            false,
            Service::new(&url, "key"),
            Box::new(Memory::default()),
        );
        let store = Mutex::new(Store::open(accounts.workspace_path(), false).unwrap());
        let view = accounts
            .handle(
                Request::SignIn {
                    email: "ada@example.com".into(),
                    password: "correct-horse".into(),
                },
                &store,
            )
            .unwrap();
        assert_eq!(view.step, "verify");
        assert!(accounts
            .handle(
                Request::Verify {
                    email: "ada@example.com".into(),
                    code: "12ab".into()
                },
                &store
            )
            .is_err());
        let view = accounts
            .handle(
                Request::Verify {
                    email: "ada@example.com".into(),
                    code: "123 456".into(),
                },
                &store,
            )
            .unwrap();
        assert_eq!(
            view.step, "signedIn",
            "an empty guest workspace needs no merge choice"
        );
        let log = log.lock().unwrap();
        assert_eq!(
            log.last().unwrap().2,
            json!({ "type": "signup", "email": "ada@example.com", "token": "123456" })
        );
        drop(store);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn without_a_configured_service_accounts_explain_themselves() {
        let root = directory();
        let mut accounts = Accounts::load(&root, false, None, Box::new(Memory::default()));
        let store = Mutex::new(Store::open(accounts.workspace_path(), false).unwrap());
        let view = accounts.handle(Request::Read, &store).unwrap();
        assert!(!view.configured);
        let error = accounts
            .handle(
                Request::SignUp {
                    email: "ada@example.com".into(),
                    password: "correct-horse".into(),
                },
                &store,
            )
            .err()
            .unwrap();
        assert_eq!(error, NOT_CONFIGURED);
        drop(store);
        fs::remove_dir_all(root).unwrap();
    }
}
