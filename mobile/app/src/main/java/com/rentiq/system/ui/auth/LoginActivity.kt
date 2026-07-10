package com.rentiq.system.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.data.api.LoginRequest
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.databinding.ActivityLoginBinding
import com.rentiq.system.ui.main.MainActivity
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var session: SessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionManager(this)

        // Already logged in → skip to main
        if (session.isLoggedIn) {
            SupabaseClient.accessToken = session.accessToken
            goToMain()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.loginButton.setOnClickListener { attemptLogin() }
    }

    private fun attemptLogin() {
        val email = binding.emailInput.text.toString().trim()
        val pw = binding.passwordInput.text.toString()
        if (email.isEmpty() || pw.isEmpty()) return

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

                    // Resolve the user's agency
                    val members = SupabaseClient.rest.getMembers()
                    android.util.Log.d("Login", "Members response: ${members.code()} body=${members.body()}")
                    val agencyId = members.body()?.firstOrNull()?.agencyId
                    android.util.Log.d("Login", "Resolved agencyId=$agencyId")
                    session.agencyId = agencyId

                    goToMain()
                } else {
                    showError()
                }
            } catch (e: Exception) {
                showError(e.message)
            }
        }
    }

    private fun showError(msg: String? = null) {
        binding.errorText.text = msg ?: getString(com.rentiq.system.R.string.login_error)
        binding.errorText.visibility = View.VISIBLE
        binding.loginButton.isEnabled = true
        binding.loginProgress.visibility = View.GONE
    }

    private fun goToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
