fn main() {
    // The account service settings are compiled in, so rebuild when they change.
    println!("cargo:rerun-if-env-changed=ADA_SUPABASE_URL");
    println!("cargo:rerun-if-env-changed=ADA_SUPABASE_PUBLISHABLE_KEY");
    tauri_build::build()
}
