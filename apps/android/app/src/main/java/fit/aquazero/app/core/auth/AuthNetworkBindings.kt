package fit.aquazero.app.core.auth

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import fit.aquazero.app.core.network.AccessTokenProvider
import fit.aquazero.app.core.network.TokenRefresher
import javax.inject.Singleton

/**
 * Binds the auth implementations to the interfaces the HTTP layer declares.
 *
 * This module deliberately lives in `core.auth`: auth may depend on network,
 * so the binding is legal here and would not be in the other direction.
 */
@Module
@InstallIn(SingletonComponent::class)
interface AuthNetworkBindings {

    @Binds
    @Singleton
    fun accessTokenProvider(store: AuthTokenStore): AccessTokenProvider

    @Binds
    @Singleton
    fun tokenRefresher(coordinator: RefreshCoordinator): TokenRefresher
}
