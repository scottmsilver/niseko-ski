package com.jpski.niseko.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class NisekoApi {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val API_BASE = "https://web-api.yukiyama.biz/web-api"
        private const val REFERER = "https://www.niseko.ne.jp/"
    }

    // Japanese to English translations for weather
    private val jpEn = mapOf(
        "吹雪" to "Snow Storm", "雪" to "Snow", "曇り" to "Cloudy", "晴れ" to "Clear",
        "粉雪" to "Powder Snow", "圧雪" to "Packed Powder", "湿雪" to "Wet Snow",
        "全面可能" to "All Courses Open", "一部可能" to "Partial Open", "閉鎖" to "Closed",
        "なし" to "—",
    )

    private fun translate(s: String?): String = if (s.isNullOrBlank()) "—" else jpEn[s] ?: s

    private fun fetchJson(url: String): JSONObject? {
        val request = Request.Builder()
            .url(url)
            .addHeader("accept", "*/*")
            .addHeader("Referer", REFERER)
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                JSONObject(response.body?.string() ?: return null)
            }
        } catch (e: Exception) {
            null
        }
    }

    suspend fun fetchAllData(): Map<String, ResortData> = coroutineScope {
        val results = Resort.ALL.map { resort ->
            async(Dispatchers.IO) {
                val lifts = fetchLifts(resort.id)
                val weather = fetchWeather(resort.id)
                resort.id to ResortData(resort, lifts, weather)
            }
        }.awaitAll().toMap()
        results
    }

    private fun fetchLifts(resortId: String): List<LiftInfo>? {
        val json = fetchJson("$API_BASE/latest-facility/backward?facilityType=lift&lang=en&skiareaId=$resortId")
            ?: return null
        val results = json.optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).map { i ->
            val obj = results.getJSONObject(i)
            LiftInfo(
                id = obj.optInt("id"),
                name = obj.optString("name", ""),
                status = obj.optString("status", "CLOSED"),
                startTime = obj.optString("start_time", "08:00"),
                endTime = obj.optString("end_time", "16:00"),
                updateDate = obj.optString("updateDate", null),
            )
        }
    }

    private fun fetchWeather(resortId: String): List<WeatherStation>? {
        val json = fetchJson("$API_BASE/latest-weather/backward?lang=en&skiareaId=$resortId")
            ?: return null
        val results = json.optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).map { i ->
            val obj = results.getJSONObject(i)
            WeatherStation(
                name = obj.optString("name", ""),
                temperature = obj.optDouble("temperature", 0.0),
                weather = translate(obj.optString("weather", "")),
                snowAccumulation = obj.optDouble("snow_accumulation", 0.0),
                snowAccumulationDiff = if (obj.has("snow_accumulation_difference")) obj.optDouble("snow_accumulation_difference") else null,
                snowState = translate(obj.optString("snow_state", "")),
                windSpeed = obj.optString("wind_speed", "—"),
                courseState = translate(obj.optString("cource_state", "")),
            )
        }
    }
}
