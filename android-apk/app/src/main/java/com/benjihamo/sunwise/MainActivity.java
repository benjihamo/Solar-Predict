package com.benjihamo.sunwise;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://benjihamo.github.io/Solar-Predict/";
    private static final String APP_HOST = "benjihamo.github.io";
    private static final int LOCATION_REQUEST = 71;
    private WebView webView;
    private ProgressBar progress;
    private View errorPanel;
    private GeolocationPermissions.Callback pendingLocationCallback;
    private String pendingLocationOrigin;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 26, 25));
        getWindow().setNavigationBarColor(Color.rgb(7, 26, 25));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 26, 25));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 26, 25));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return route(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return route(Uri.parse(url));
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                progress.setVisibility(View.VISIBLE);
                errorPanel.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                requestLocationForSite(origin, callback);
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(Color.rgb(209, 250, 112)));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(-1, 4, Gravity.TOP);
        root.addView(progress, progressParams);

        errorPanel = createErrorPanel();
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
        setContentView(root);
        webView.loadUrl(APP_URL);
    }

    private boolean route(Uri uri) {
        if ("https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (Exception e) { Toast.makeText(this, "This link could not be opened.", Toast.LENGTH_SHORT).show(); }
        return true;
    }

    private void requestLocationForSite(String origin, GeolocationPermissions.Callback callback) {
        Uri uri = Uri.parse(origin);
        if (!"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) { callback.invoke(origin, false, false); return; }
        if (hasLocationPermission()) { callback.invoke(origin, true, false); return; }
        pendingLocationOrigin = origin;
        pendingLocationCallback = callback;
        new AlertDialog.Builder(this)
            .setTitle("Use your approximate location?")
            .setMessage("Sunwise uses it to set your local forecast. Your coordinates are saved on this device and sent to Open-Meteo for the solar forecast. You can enter coordinates instead.")
            .setNegativeButton("Not now", (dialog, which) -> finishLocationRequest(false))
            .setPositiveButton("Continue", (dialog, which) -> requestPermissions(
                new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST))
            .setOnCancelListener(dialog -> finishLocationRequest(false))
            .show();
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_REQUEST || pendingLocationCallback == null) return;
        boolean granted = hasLocationPermission();
        finishLocationRequest(granted);
        if (!granted) Toast.makeText(this, "You can enter your coordinates in the app instead.", Toast.LENGTH_LONG).show();
    }

    private void finishLocationRequest(boolean granted) {
        if (pendingLocationCallback != null) pendingLocationCallback.invoke(pendingLocationOrigin, granted, false);
        pendingLocationCallback = null;
        pendingLocationOrigin = null;
    }

    private View createErrorPanel() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(32, 32, 32, 32);
        box.setBackgroundColor(Color.rgb(7, 26, 25));
        TextView title = new TextView(this);
        title.setText("Can’t reach Sunwise right now");
        title.setTextColor(Color.rgb(244, 245, 233));
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        TextView detail = new TextView(this);
        detail.setText("Check your internet connection, then try again.");
        detail.setTextColor(Color.rgb(176, 194, 183));
        detail.setTextSize(15);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, 12, 0, 20);
        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> { errorPanel.setVisibility(View.GONE); webView.loadUrl(APP_URL); });
        box.addView(title);
        box.addView(detail);
        box.addView(retry);
        return box;
    }

    private void showError() {
        progress.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        finishLocationRequest(false);
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}

