package com.rentiq.system.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.getSystemService
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.R
import com.rentiq.system.data.api.LoginRequest
import com.rentiq.system.data.api.RefreshRequest
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.databinding.ActivityLoginBinding
import com.rentiq.system.ui.main.MainActivity
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var session: SessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionManager(this)
        SupabaseClient.bindSession(applicationContext)

        if (session.isLoggedIn) {
            SupabaseClient.accessToken = session.accessToken
            restoreSession()
            return
        }

        showLogin()
    }

    private fun restoreSession() {
        lifecycleScope.launch {
            val refreshToken = session.refreshToken
            if (refreshToken.isNullOrBlank()) {
                session.clear()
                showLogin()
                return@launch
            }

            try {
                val res = SupabaseClient.auth.refresh(RefreshRequest(refreshToken))
                if (res.isSuccessful && res.body() != null) {
                    val body = res.body()!!
                    session.accessToken = body.accessToken
                    session.refreshToken = body.refreshToken
                    session.userId = body.user?.id ?: session.userId
                    SupabaseClient.accessToken = body.accessToken
                    if (AuthSession.ensureAgencyId(this@LoginActivity, showMessage = false).isNullOrBlank()) {
                        session.clear()
                        showLogin()
                        return@launch
                    }
                    goToMain()
                } else {
                    session.clear()
                    showLogin()
                }
            } catch (_: Exception) {
                session.clear()
                showLogin()
            }
        }
    }

    private fun showLogin() {
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.loginButton.setOnClickListener { attemptLogin() }
        binding.emailInput.doAfterTextChanged { clearError() }
        binding.passwordInput.doAfterTextChanged { clearError() }
    }

    private fun attemptLogin() {
        hideKeyboardAndClearFocus()
        val email = binding.emailInput.text.toString().trim()
        val pw = binding.passwordInput.text.toString()
        if (email.isEmpty() || pw.isEmpty()) {
            showError(getString(R.string.login_missing_fields))
            return
        }

        binding.loginButton.isEnabled = false
        binding.loginProgress.visibility = View.VISIBLE
        binding.errorText.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.auth.login(LoginRequest(email, pw))
                if (res.isSuccessful && res.body() != null) {
                    val body = res.body()!!
                    session.accessToken = body.accessToken
                    session.refreshToken = body.refreshToken
                    session.userId = body.user?.id
                    SupabaseClient.accessToken = body.accessToken

                    val agencyId = AuthSession.ensureAgencyId(this@LoginActivity, showMessage = false)
                    if (agencyId.isNullOrBlank()) {
                        showError(getString(R.string.agency_not_found))
                        return@launch
                    }

                    goToMain()
                } else {
                    showError(loginErrorForStatus(res.code()))
                }
            } catch (error: Exception) {
                showError(loginErrorForException(error))
            }
        }
    }

    private fun hideKeyboardAndClearFocus() {
        val token = currentFocus?.windowToken ?: binding.root.windowToken
        getSystemService<InputMethodManager>()?.hideSoftInputFromWindow(token, 0)
        binding.emailInput.clearFocus()
        binding.passwordInput.clearFocus()
    }

    private fun loginErrorForStatus(status: Int): String = when (status) {
        400, 401, 403 -> getString(R.string.login_error)
        429 -> getString(R.string.login_too_many_attempts)
        in 500..599 -> getString(R.string.login_server_error)
        else -> getString(R.string.login_generic_error)
    }

    private fun loginErrorForException(error: Exception): String = when (error) {
        is UnknownHostException,
        is ConnectException,
        is SocketTimeoutException,
        is IOException -> getString(R.string.login_network_error)
        else -> getString(R.string.login_generic_error)
    }

    private fun clearError() {
        if (::binding.isInitialized && binding.errorText.visibility == View.VISIBLE) {
            binding.errorText.visibility = View.GONE
        }
    }

    private fun showError(msg: String) {
        binding.errorText.text = msg
        binding.errorText.visibility = View.VISIBLE
        binding.loginButton.isEnabled = true
        binding.loginProgress.visibility = View.GONE
    }

    private fun goToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
