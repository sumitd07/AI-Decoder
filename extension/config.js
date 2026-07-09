// Point the extension at the SAME Supabase project as the web app, so clips land
// in the same cheatsheet. Fill these with the values from web/index.html
// (Supabase Settings → Data API for the URL, API Keys for the publishable/anon key).
self.DECODER_SUPABASE = {
  url: "",       // https://<project-ref>.supabase.co
  anonKey: ""    // sb_publishable_...  (or the legacy anon key) — NEVER the secret key
};
