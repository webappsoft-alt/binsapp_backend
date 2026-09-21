import admin from "firebase-admin";
import config from "./env.js";

const firebaseConfig = {
  type: config.get("firebase.type"),
  project_id: config.get("firebase.projectId"),
  client_email: config.get("firebase.clientEmail"),
  private_key: config.get("firebase.privateKey"),
  private_key_id: config.get("firebase.privateKeyId"),
  client_id: config.get("firebase.clientId"),
  auth_uri: config.get("firebase.authURI"),
  token_uri: config.get("firebase.tokenURI"),
  auth_provider_x509_cert_url: config.get("firebase.authProviderCertURL"),
  client_x509_cert_url: config.get("firebase.clientCertURL"),
  universe_domain: config.get("firebase.universeDomain"),
};
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  storageBucket: "gs://dumpster-df2b0.appspot.com",
});
export default admin;
