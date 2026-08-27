package fit.aquazero.app.core.database

import android.content.Context
import androidx.room3.Room
import androidx.sqlite.driver.AndroidSQLiteDriver
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers

/** Room wiring. Explicit [AndroidSQLiteDriver]; no destructive fallback, ever. */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): AzfDatabase =
        Room.databaseBuilder(context, AzfDatabase::class.java, "azf.db")
            .setDriver(AndroidSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.IO)
            .build()

    @Provides fun logsDao(db: AzfDatabase): LogsDao = db.logsDao()

    @Provides fun outboxDao(db: AzfDatabase): OutboxDao = db.outboxDao()

    @Provides fun catalogDao(db: AzfDatabase): CatalogDao = db.catalogDao()

    @Provides fun userDao(db: AzfDatabase): UserDao = db.userDao()

    @Provides fun trainingDao(db: AzfDatabase): TrainingDao = db.trainingDao()

    @Provides fun progressDao(db: AzfDatabase): ProgressDao = db.progressDao()

    @Provides fun chatDao(db: AzfDatabase): ChatDao = db.chatDao()
}
