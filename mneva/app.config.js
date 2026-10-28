const appJson = require('./app.json');

const config = appJson.expo;

// The call-log relationship-nudge feature ("who do I talk to regularly")
// needs READ_CALL_LOG, which Google Play's sensitive-permissions review
// doesn't have an approved declaration category for outside of default
// dialer/SMS/safety apps. Rather than risk the whole app being rejected or
// the (brand-new) developer account suspended over one feature, Play Store
// builds add it to blockedPermissions — Expo's mechanism for tagging a
// permission tools:node="remove" in the manifest, which Android's Gradle
// manifest merger honors even though the native module's own manifest
// still declares it (simply filtering app.json's own manifest source, as
// an earlier attempt here did, gets overwritten by that merge — this is
// the one approach that survives it). The native module still compiles in
// either way; without the merged manifest entry, Android just never grants
// the permission, so the feature quietly stays unavailable rather than
// crashing. Set MNEVA_INCLUDE_CALL_LOG=1 when building a personal/sideload
// APK to keep the permission (and the feature) in the build.
if (process.env.MNEVA_INCLUDE_CALL_LOG !== '1') {
  config.android.blockedPermissions = [
    ...(config.android.blockedPermissions || []),
    'android.permission.READ_CALL_LOG',
  ];
}

module.exports = { expo: config };
