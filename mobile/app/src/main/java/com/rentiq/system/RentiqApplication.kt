package com.rentiq.system

import android.app.Application
import com.rentiq.system.data.api.SupabaseClient

class RentiqApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SupabaseClient.bindSession(this)
    }
}
