# Keep WebView JS interface (none used yet, but safe for future bridges).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
