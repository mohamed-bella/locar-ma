package com.rentiq.system.ui.suivi

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.rentiq.system.R
import com.rentiq.system.databinding.ActivitySuiviBinding

class SuiviActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySuiviBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySuiviBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.toolbar.setNavigationOnClickListener { finish() }
        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.container, SuiviFragment())
                .commit()
        }
    }
}
