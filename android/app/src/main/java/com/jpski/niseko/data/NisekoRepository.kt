package com.jpski.niseko.data

import java.util.concurrent.CopyOnWriteArrayList

class NisekoRepository {
    private val api = NisekoApi()
    private var previousData: Map<String, ResortData> = emptyMap()
    val changeLog = CopyOnWriteArrayList<ChangeEntry>()

    suspend fun fetchData(): Map<String, ResortData> {
        val data = api.fetchAllData()
        detectChanges(data)
        previousData = data
        return data
    }

    private fun detectChanges(newData: Map<String, ResortData>) {
        val now = System.currentTimeMillis()
        for ((resortId, resortData) in newData) {
            val newLifts = resortData.lifts ?: continue
            val prevLifts = previousData[resortId]?.lifts ?: continue
            for (lift in newLifts) {
                val prev = prevLifts.find { it.id == lift.id } ?: continue
                if (prev.status != lift.status) {
                    changeLog.add(ChangeEntry(
                        time = now,
                        resortName = resortData.resort.name,
                        liftName = lift.name,
                        from = LiftStatus.fromApi(prev.status).label,
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
