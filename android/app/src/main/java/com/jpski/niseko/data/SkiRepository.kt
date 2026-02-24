package com.jpski.niseko.data

import java.util.concurrent.CopyOnWriteArrayList

class SkiRepository {
    private val api = SkiApi()
    @Volatile
    var activeResort: ResortConfig = NISEKO_RESORTS.first()

    @Volatile
    private var previousData: FetchResult? = null
    val changeLog = CopyOnWriteArrayList<ChangeEntry>()

    suspend fun fetchData(): FetchResult {
        val data = api.fetchData(activeResort)
        detectChanges(data)
        previousData = data
        return data
    }

    fun switchResort(resort: ResortConfig) {
        activeResort = resort
        previousData = null
        changeLog.clear()
    }

    private fun detectChanges(newData: FetchResult) {
        val prev = previousData ?: return
        val now = System.currentTimeMillis()
        for (sr in newData.subResorts) {
            val newLifts = sr.lifts ?: continue
            val prevSr = prev.subResorts.find { it.id == sr.id } ?: continue
            val prevLifts = prevSr.lifts ?: continue
            for (lift in newLifts) {
                val prevLift = prevLifts.find { it.id == lift.id } ?: continue
                if (prevLift.status != lift.status) {
                    changeLog.add(ChangeEntry(
                        time = now,
                        resortName = sr.name,
                        liftName = lift.name,
                        from = LiftStatus.fromApi(prevLift.status).label,
                        to = LiftStatus.fromApi(lift.status).label,
                    ))
                }
            }
        }
        // Keep only last 10 minutes
        val cutoff = now - 600_000
        changeLog.removeAll { it.time < cutoff }
    }
}
