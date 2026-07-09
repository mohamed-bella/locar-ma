package com.rentiq.system

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.rentiq.system.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val webView get() = binding.webView

    // Base host we keep inside the WebView; everything else opens externally.
    private val startUrl = "https://app.rentiq-system.com"
    private val appHost = "app.rentiq-system.com"

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null

    // File chooser result (gallery/documents + camera capture merged)
    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = fileCallback ?: return@registerForActivityResult
            var uris: Array<Uri>? = null
            if (result.resultCode == RESULT_OK) {
                val data = result.data
                uris = when {
                    data?.dataString != null -> arrayOf(Uri.parse(data.dataString))
                    data?.clipData != null -> Array(data.clipData!!.itemCount) { i ->
                        data.clipData!!.getItemAt(i).uri
                    }
                    cameraImageUri != null -> arrayOf(cameraImageUri!!)
                    else -> null
                }
            }
            cb.onReceiveValue(uris ?: arrayOf())
            fileCallback = null
            cameraImageUri = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            userAgentString = "$userAgentString RentiqApp/1.0"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val url = req.url
                val scheme = url.scheme ?: ""
                // Non-http schemes (tel, mailto, whatsapp, intent) → external app.
                if (scheme != "http" && scheme != "https") {
                    openExternally(url)
                    return true
                }
                // Different host (WhatsApp web, payment, Google) → external browser.
                if (url.host != null && url.host != appHost) {
                    openExternally(url)
                    return true
                }
                return false // same host → stay in the WebView
            }

            override fun onPageFinished(view: WebView, url: String) {
                binding.swipe.isRefreshing = false
                binding.errorView.visibility = android.view.View.GONE
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    binding.errorView.visibility = android.view.View.VISIBLE
                }
                binding.swipe.isRefreshing = false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progress.progress = newProgress
                binding.progress.visibility =
                    if (newProgress in 1..99) android.view.View.VISIBLE else android.view.View.GONE
            }

            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                launchFileChooser(params)
                return true
            }
        }

        // Download contract PDFs / reports via the system DownloadManager.
        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("User-Agent", userAgent)
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                    setTitle(name)
                }
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                Toast.makeText(this, getString(R.string.downloading), Toast.LENGTH_SHORT).show()
            } catch (t: Throwable) {
                openExternally(Uri.parse(url))
            }
        })

        binding.swipe.setOnRefreshListener { webView.reload() }
        binding.retryButton.setOnClickListener {
            binding.errorView.visibility = android.view.View.GONE
            webView.reload()
        }

        // Back button walks WebView history first.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl(startUrl)
    }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams) {
        // Content picker
        val content = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = params.acceptTypes.firstOrNull { it.isNotEmpty() } ?: "*/*"
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
        // Camera capture (for CIN / document photos)
        val camera = try {
            val photo = File.createTempFile("capture_", ".jpg", cacheDir)
            cameraImageUri = FileProvider.getUriForFile(
                this, "$packageName.fileprovider", photo
            )
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri)
        } catch (t: Throwable) {
            null
        }

        val chooser = Intent(Intent.ACTION_CHOOSER).apply {
            putExtra(Intent.EXTRA_INTENT, content)
            putExtra(Intent.EXTRA_TITLE, getString(R.string.choose_file))
            if (camera != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
        }
        try {
            fileChooser.launch(chooser)
        } catch (t: ActivityNotFoundException) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
        }
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (t: ActivityNotFoundException) {
            Toast.makeText(this, getString(R.string.no_app), Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
