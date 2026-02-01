// ═══════════════════════════════════════════════════════════════════════════
// AUTH UI - Компоненты интерфейса авторизации
// ═══════════════════════════════════════════════════════════════════════════

import { firebaseService } from "../firebaseService";

export type AuthFormType = "login" | "register" | "reset" | "profile" | null;

export interface AuthUICallbacks {
    onAuthSuccess?: () => void;
    onAuthError?: (error: string) => void;
    onClose?: () => void;
}

export class AuthUI {
    private container: HTMLDivElement | null = null;
    private currentForm: AuthFormType = null;
    private callbacks: AuthUICallbacks = {};
    private static stylesInjected = false;

    /**
     * Инъекция стилей для форм авторизации
     */
    private static injectStyles(): void {
        if (this.stylesInjected) return;

        const style = document.createElement("style");
        style.id = "auth-ui-styles";
        style.textContent = `
            /* Стиль в духе Protocol TX - киберпанк/терминал */
            .auth-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 100001;
                font-family: 'Press Start 2P', monospace;
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .auth-panel {
                background: rgba(0, 10, 0, 0.95);
                border: 2px solid rgba(0, 255, 4, 0.6);
                border-radius: 8px;
                box-shadow: 0 0 30px rgba(0, 255, 0, 0.4), inset 0 0 20px rgba(0, 255, 0, 0.05);
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
                animation: slideIn 0.3s ease;
                color: #0f0;
            }

            @keyframes slideIn {
                from {
                    transform: translateY(-20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            .auth-header {
                background: linear-gradient(180deg, rgba(0, 20, 0, 0.9) 0%, rgba(0, 10, 0, 0.95) 100%);
                padding: 16px 20px;
                border-bottom: 2px solid rgba(0, 255, 4, 0.4);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .auth-header h2 {
                margin: 0;
                color: #0ff;
                font-size: 20px;
                font-weight: bold;
                text-shadow: 0 0 10px rgba(0, 255, 255, 0.6);
                font-family: 'Press Start 2P', monospace;
                letter-spacing: 1px;
            }

            .auth-close {
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                color: #0ff;
                width: 32px;
                height: 32px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                font-family: 'Press Start 2P', monospace;
            }

            .auth-close:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.1);
                box-shadow: 0 0 10px rgba(0, 255, 4, 0.5);
            }

            .auth-content {
                padding: 20px;
            }

            .auth-field {
                margin-bottom: 16px;
            }

            .auth-field label {
                display: block;
                color: #7f7;
                font-size: 12px;
                margin-bottom: 6px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-family: 'Press Start 2P', monospace;
            }

            .auth-field input {
                width: 100%;
                padding: 10px 12px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 4, 0.4);
                border-radius: 4px;
                color: #0f0;
                font-size: 13px;
                font-family: 'Press Start 2P', monospace;
                box-sizing: border-box;
                transition: all 0.3s ease;
            }

            .auth-field input:focus {
                outline: none;
                border-color: #0ff;
                box-shadow: 0 0 10px rgba(0, 255, 255, 0.4);
                background: rgba(0, 10, 0, 0.7);
            }

            .auth-field input::placeholder {
                color: rgba(0, 255, 4, 0.3);
            }

            .auth-field small {
                display: block;
                color: rgba(0, 255, 4, 0.5);
                font-size: 10px;
                margin-top: 4px;
                font-family: 'Press Start 2P', monospace;
            }

            .username-check {
                margin-top: 6px;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
                font-family: 'Press Start 2P', monospace;
                font-weight: bold;
            }

            .username-check.available {
                color: #0f0;
                background: rgba(0, 255, 0, 0.15);
                border: 1px solid rgba(0, 255, 0, 0.4);
                text-shadow: 0 0 5px #0f0;
            }

            .username-check.taken {
                color: #f00;
                background: rgba(255, 0, 0, 0.15);
                border: 1px solid rgba(255, 0, 0, 0.4);
                text-shadow: 0 0 5px #f00;
            }

            .auth-btn {
                width: 100%;
                padding: 12px;
                border: 2px solid rgba(0, 255, 4, 0.6);
                border-radius: 4px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-family: 'Press Start 2P', monospace;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .auth-btn.primary {
                background: rgba(0, 255, 4, 0.2);
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }

            .auth-btn.primary:hover {
                background: rgba(0, 255, 4, 0.3);
                transform: translateY(-2px);
                box-shadow: 0 0 15px rgba(0, 255, 4, 0.5);
                border-color: #0f0;
            }

            .auth-btn.secondary {
                background: rgba(0, 255, 4, 0.1);
                border: 1px solid rgba(0, 255, 4, 0.4);
                color: #7f7;
            }

            .auth-btn.secondary:hover {
                background: rgba(0, 255, 4, 0.2);
                border-color: rgba(0, 255, 4, 0.6);
                color: #0f0;
            }

            .auth-btn.danger {
                background: rgba(255, 0, 0, 0.15);
                border: 1px solid rgba(255, 0, 0, 0.6);
                color: #f00;
                text-shadow: 0 0 5px #f00;
            }

            .auth-btn.danger:hover {
                background: rgba(255, 0, 0, 0.25);
                box-shadow: 0 0 15px rgba(255, 0, 0, 0.5);
            }

            .auth-btn.google {
                background: rgba(0, 255, 4, 0.1);
                border: 1px solid rgba(0, 255, 4, 0.4);
                color: #0ff;
            }

            .auth-btn.google:hover {
                background: rgba(0, 255, 4, 0.2);
                box-shadow: 0 0 10px rgba(0, 255, 255, 0.4);
            }

            .auth-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                transform: none !important;
            }

            .google-icon {
                width: 20px;
                height: 20px;
                background: rgba(0, 255, 255, 0.2);
                border: 1px solid rgba(0, 255, 255, 0.4);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #0ff;
                font-weight: bold;
                font-size: 12px;
                font-family: 'Press Start 2P', monospace;
            }

            .auth-divider {
                text-align: center;
                color: rgba(0, 255, 4, 0.4);
                margin: 20px 0;
                position: relative;
                font-size: 11px;
                font-family: 'Press Start 2P', monospace;
                text-transform: uppercase;
            }

            .auth-divider::before,
            .auth-divider::after {
                content: '';
                position: absolute;
                top: 50%;
                width: 40%;
                height: 1px;
                background: rgba(0, 255, 4, 0.3);
            }

            .auth-divider::before {
                left: 0;
            }

            .auth-divider::after {
                right: 0;
            }

            .auth-links {
                text-align: center;
                margin-top: 16px;
            }

            .auth-links a {
                color: #0ff;
                text-decoration: none;
                font-size: 11px;
                display: block;
                margin: 8px 0;
                transition: all 0.3s ease;
                font-family: 'Press Start 2P', monospace;
                text-transform: uppercase;
            }

            .auth-links a:hover {
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
                text-decoration: underline;
            }

            .auth-error {
                background: rgba(255, 0, 0, 0.15);
                border: 1px solid rgba(255, 0, 0, 0.6);
                color: #f00;
                padding: 12px;
                border-radius: 4px;
                margin-bottom: 16px;
                font-size: 12px;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 5px #f00;
            }

            .auth-success {
                background: rgba(0, 255, 0, 0.15);
                border: 1px solid rgba(0, 255, 4, 0.6);
                color: #0f0;
                padding: 12px;
                border-radius: 4px;
                margin-bottom: 16px;
                font-size: 12px;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 5px #0f0;
            }

            .user-profile {
                color: #7f7;
                font-family: 'Press Start 2P', monospace;
            }

            .profile-field {
                margin-bottom: 20px;
            }

            .profile-field label {
                display: block;
                color: #0ff;
                font-size: 12px;
                margin-bottom: 6px;
                font-weight: bold;
                text-transform: uppercase;
                font-family: 'Press Start 2P', monospace;
            }

            .profile-value {
                color: #0f0;
                font-size: 14px;
                padding: 8px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px;
                font-family: 'Press Start 2P', monospace;
            }

            .verified {
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }

            .not-verified {
                color: #f00;
                text-shadow: 0 0 5px #f00;
            }

            .auth-actions {
                margin-top: 24px;
                padding-top: 20px;
                border-top: 1px solid rgba(0, 255, 4, 0.3);
            }

            /* Скроллбары в стиле игры */
            .auth-panel::-webkit-scrollbar {
                width: 8px;
            }

            .auth-panel::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.2);
            }

            .auth-panel::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: 4px;
            }

            .auth-panel::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 255, 4, 0.6);
            }

            @media (max-width: 768px) {
                .auth-panel {
                    width: 95%;
                    max-height: 95vh;
                }

                .auth-header h2 {
                    font-size: 18px;
                }
            }
        `;

        document.head.appendChild(style);
        this.stylesInjected = true;
    }

    /**
     * Создание контейнера для форм авторизации
     */
    createContainer(): HTMLDivElement {
        if (this.container) {
            return this.container;
        }

        AuthUI.injectStyles();

        this.container = document.createElement("div");
        this.container.id = "auth-ui-container";
        this.container.className = "auth-overlay";
        this.container.style.display = "none";

        return this.container;
    }

    /**
     * Показать форму входа
     */
    showLoginForm(callbacks?: AuthUICallbacks): void {
        console.log("[AuthUI] showLoginForm() called - IMMEDIATE");
        this.callbacks = callbacks || {};
        this.currentForm = "login";

        // СРАЗУ показываем контейнер, потом рендерим содержимое
        if (!this.container) {
            this.createContainer();
            if (this.container && !document.body.contains(this.container)) {
                document.body.appendChild(this.container);
            }
        }

        // Показываем контейнер СРАЗУ
        if (this.container) {
            this.container.style.display = "flex";
            this.container.style.zIndex = "100001";
            this.container.style.visibility = "visible";
            this.container.style.opacity = "1";
        }

        // Рендерим содержимое (может быть асинхронным, но окно уже видно)
        this.render().catch(err => {
            console.error("[AuthUI] Error rendering login form:", err);
        });
    }

    /**
     * Показать форму регистрации
     */
    showRegisterForm(callbacks?: AuthUICallbacks): void {
        console.log("[AuthUI] showRegisterForm() called - IMMEDIATE");
        this.callbacks = callbacks || {};
        this.currentForm = "register";

        // СРАЗУ показываем контейнер, потом рендерим содержимое
        if (!this.container) {
            this.createContainer();
            if (this.container && !document.body.contains(this.container)) {
                document.body.appendChild(this.container);
            }
        }

        // Показываем контейнер СРАЗУ
        if (this.container) {
            this.container.style.display = "flex";
            this.container.style.zIndex = "100001";
            this.container.style.visibility = "visible";
            this.container.style.opacity = "1";
        }

        // Рендерим содержимое (может быть асинхронным, но окно уже видно)
        this.render().catch(err => {
            console.error("[AuthUI] Error rendering register form:", err);
        });
    }

    /**
     * Показать форму восстановления пароля
     */
    showPasswordResetForm(callbacks?: AuthUICallbacks): void {
        this.callbacks = callbacks || {};
        this.currentForm = "reset";
        this.render();
    }

    /**
     * Показать профиль пользователя
     */
    showUserProfile(callbacks?: AuthUICallbacks): void {
        this.callbacks = callbacks || {};
        this.currentForm = "profile";
        this.render();
    }

    /**
     * Скрыть формы авторизации
     */
    hide(): void {
        if (this.container) {
            this.container.style.display = "none";
        }
        this.currentForm = null;
        if (this.callbacks.onClose) {
            this.callbacks.onClose();
        }
    }

    /**
     * Рендеринг текущей формы
     */
    private async render(): Promise<void> {
        console.log("[AuthUI] render() called, currentForm:", this.currentForm);
        if (!this.container) {
            console.log("[AuthUI] Container not found, creating...");
            this.createContainer();
            // Убеждаемся, что контейнер добавлен в DOM
            if (this.container && !document.body.contains(this.container)) {
                document.body.appendChild(this.container);
                console.log("[AuthUI] Container added to DOM");
            }
        }

        if (!this.container) {
            console.error("[AuthUI] Container is null after creation!");
            return;
        }

        // Контейнер уже показан в showLoginForm/showRegisterForm, просто убеждаемся
        if (this.container.style.display !== "flex") {
            console.log("[AuthUI] Showing container");
            this.container.style.display = "flex";
        }
        this.container.style.zIndex = "100001";
        this.container.style.visibility = "visible";
        this.container.style.opacity = "1";

        switch (this.currentForm) {
            case "login":
                this.container.innerHTML = this.createLoginForm();
                this.attachLoginHandlers();
                break;
            case "register":
                this.container.innerHTML = this.createRegisterForm();
                this.attachRegisterHandlers();
                break;
            case "reset":
                this.container.innerHTML = this.createPasswordResetForm();
                this.attachResetHandlers();
                break;
            case "profile":
                this.container.innerHTML = await this.createUserProfile();
                this.attachProfileHandlers();
                break;
        }
    }

    /**
     * Создание HTML формы входа
     */
    private createLoginForm(): string {
        return `
            <div class="auth-panel">
                <div class="auth-header">
                    <h2>ВХОД</h2>
                    <button class="auth-close" id="auth-close">✕</button>
                </div>
                <div class="auth-content">
                    <div class="auth-error" id="auth-error" style="display: none;"></div>
                    <form id="login-form">
                        <div class="auth-field">
                            <label for="login-email">Email</label>
                            <input type="email" id="login-email" required autocomplete="email" placeholder="your@email.com">
                        </div>
                        <div class="auth-field">
                            <label for="login-password">Пароль</label>
                            <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••">
                        </div>
                        <button type="submit" class="auth-btn primary" id="login-submit">ВОЙТИ</button>
                    </form>
                    <div class="auth-divider">или</div>
                    <button class="auth-btn google" id="google-signin">
                        <span class="google-icon">G</span>
                        Войти через Google
                    </button>
                    <button class="auth-btn secondary" id="admin-quick-login" style="margin-top: 8px;">
                        <span class="btn-icon">👑</span>
                        Быстрый вход (админ)
                    </button>
                    <div class="auth-links">
                        <a href="#" id="auth-show-register">Нет аккаунта? Зарегистрироваться</a>
                        <a href="#" id="auth-show-reset">Забыли пароль?</a>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Создание HTML формы регистрации
     */
    private createRegisterForm(): string {
        return `
            <div class="auth-panel">
                <div class="auth-header">
                    <h2>РЕГИСТРАЦИЯ</h2>
                    <button class="auth-close" id="auth-close">✕</button>
                </div>
                <div class="auth-content">
                    <div class="auth-error" id="auth-error" style="display: none;"></div>
                    <form id="register-form">
                        <div class="auth-field">
                            <label for="register-username">Имя пользователя</label>
                            <input type="text" id="register-username" required autocomplete="username" placeholder="username" minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]+">
                            <small>3-20 символов, только буквы, цифры и _</small>
                            <div class="username-check" id="username-check" style="display: none;"></div>
                        </div>
                        <div class="auth-field">
                            <label for="register-email">Email</label>
                            <input type="email" id="register-email" required autocomplete="email" placeholder="your@email.com">
                        </div>
                        <div class="auth-field">
                            <label for="register-password">Пароль</label>
                            <input type="password" id="register-password" required autocomplete="new-password" placeholder="••••••••" minlength="6">
                            <small>Минимум 6 символов</small>
                        </div>
                        <div class="auth-field">
                            <label for="register-password-confirm">Подтвердите пароль</label>
                            <input type="password" id="register-password-confirm" required autocomplete="new-password" placeholder="••••••••">
                        </div>
                        <button type="submit" class="auth-btn primary" id="register-submit">ЗАРЕГИСТРИРОВАТЬСЯ</button>
                    </form>
                    <div class="auth-divider">или</div>
                    <button class="auth-btn google" id="google-signup">
                        <span class="google-icon">G</span>
                        Зарегистрироваться через Google
                    </button>
                    <div class="auth-links">
                        <a href="#" id="auth-show-login">Уже есть аккаунт? Войти</a>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Создание HTML формы восстановления пароля
     */
    private createPasswordResetForm(): string {
        return `
            <div class="auth-panel">
                <div class="auth-header">
                    <h2>ВОССТАНОВЛЕНИЕ ПАРОЛЯ</h2>
                    <button class="auth-close" id="auth-close">✕</button>
                </div>
                <div class="auth-content">
                    <div class="auth-error" id="auth-error" style="display: none;"></div>
                    <div class="auth-success" id="auth-success" style="display: none;"></div>
                    <form id="reset-form">
                        <p>Введите email, на который будет отправлена ссылка для сброса пароля:</p>
                        <div class="auth-field">
                            <label for="reset-email">Email</label>
                            <input type="email" id="reset-email" required autocomplete="email" placeholder="your@email.com">
                        </div>
                        <button type="submit" class="auth-btn primary" id="reset-submit">ОТПРАВИТЬ</button>
                    </form>
                    <div class="auth-links">
                        <a href="#" id="auth-show-login">Вернуться к входу</a>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Создание HTML профиля пользователя
     */
    private async createUserProfile(): Promise<string> {
        const username = await firebaseService.getUsername();
        const email = firebaseService.getEmail();
        const emailVerified = firebaseService.checkEmailVerified();

        return `
            <div class="auth-panel">
                <div class="auth-header">
                    <h2>ПРОФИЛЬ</h2>
                    <button class="auth-close" id="auth-close">✕</button>
                </div>
                <div class="auth-content">
                    <div class="user-profile">
                        <div class="profile-field">
                            <label>Имя пользователя</label>
                            <div class="profile-value">${username || "Не установлено"}</div>
                        </div>
                        <div class="profile-field">
                            <label>Email</label>
                            <div class="profile-value">${email || "Не указан"}</div>
                        </div>
                        <div class="profile-field">
                            <label>Email верифицирован</label>
                            <div class="profile-value">
                                ${emailVerified ? '<span class="verified">✓ Да</span>' : '<span class="not-verified">✗ Нет</span>'}
                            </div>
                        </div>
                        ${!emailVerified ? `
                            <button class="auth-btn secondary" id="resend-verification">
                                Отправить письмо для верификации
                            </button>
                        ` : ''}
                        <div class="auth-actions">
                            <button class="auth-btn danger" id="auth-signout">ВЫЙТИ</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Привязка обработчиков для формы входа
     */
    private attachLoginHandlers(): void {
        const form = document.getElementById("login-form") as HTMLFormElement;
        const googleBtn = document.getElementById("google-signin");
        const showRegister = document.getElementById("auth-show-register");
        const showReset = document.getElementById("auth-show-reset");
        const closeBtn = document.getElementById("auth-close");

        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = (document.getElementById("login-email") as HTMLInputElement)?.value;
            const password = (document.getElementById("login-password") as HTMLInputElement)?.value;

            if (!email || !password) {
                this.showError("Заполните все поля");
                return;
            }

            const submitBtn = document.getElementById("login-submit") as HTMLButtonElement;
            submitBtn.disabled = true;
            submitBtn.textContent = "ВХОД...";

            const result = await firebaseService.signInWithEmail(email, password);

            if (result.success) {
                this.hide();
                if (this.callbacks.onAuthSuccess) {
                    this.callbacks.onAuthSuccess();
                }
            } else {
                this.showError(result.error || "Ошибка входа");
                submitBtn.disabled = false;
                submitBtn.textContent = "ВОЙТИ";
            }
        });

        googleBtn?.addEventListener("click", async () => {
            const btn = googleBtn as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = "ВХОД...";

            const result = await firebaseService.signInWithGoogle();

            if (result.success) {
                this.hide();
                if (this.callbacks.onAuthSuccess) {
                    this.callbacks.onAuthSuccess();
                }
            } else {
                this.showError(result.error || "Ошибка входа через Google");
                btn.disabled = false;
                btn.innerHTML = '<span class="google-icon">G</span> Войти через Google';
            }
        });

        const adminQuickLoginBtn = document.getElementById("admin-quick-login");
        adminQuickLoginBtn?.addEventListener("click", async () => {
            const btn = adminQuickLoginBtn as HTMLButtonElement;
            btn.disabled = true;
            btn.innerHTML = '<span class="btn-icon">👑</span> ВХОД...';

            // Быстрый вход админом - используем стандартные учетные данные
            const adminEmail = "admin@admin.com";
            const adminPassword = "admin";

            const result = await firebaseService.signInWithEmail(adminEmail, adminPassword);

            if (result.success) {
                this.hide();
                if (this.callbacks.onAuthSuccess) {
                    this.callbacks.onAuthSuccess();
                }
            } else {
                // Улучшенная обработка ошибок для админ-входа
                let errorMessage = "Ошибка входа админом.";
                if (result.error) {
                    if (result.error.includes("user-not-found") || result.error.includes("wrong-password")) {
                        errorMessage = "Пользователь admin@admin.com не найден или неверный пароль. Убедитесь, что пользователь создан в Firebase.";
                    } else if (result.error.includes("auth/network-request-failed")) {
                        errorMessage = "Ошибка сети. Проверьте подключение к интернету.";
                    } else if (result.error.includes("auth/invalid-email")) {
                        errorMessage = "Неверный формат email.";
                    } else {
                        errorMessage = result.error;
                    }
                }
                this.showError(errorMessage);
                btn.disabled = false;
                btn.innerHTML = '<span class="btn-icon">👑</span> Быстрый вход (админ)';
                console.error("[AuthUI] Admin login failed:", result.error);
            }
        });

        showRegister?.addEventListener("click", (e) => {
            e.preventDefault();
            this.showRegisterForm(this.callbacks);
        });

        showReset?.addEventListener("click", (e) => {
            e.preventDefault();
            this.showPasswordResetForm(this.callbacks);
        });

        closeBtn?.addEventListener("click", () => {
            this.hide();
        });
    }

    /**
     * Привязка обработчиков для формы регистрации
     */
    private attachRegisterHandlers(): void {
        const form = document.getElementById("register-form") as HTMLFormElement;
        const googleBtn = document.getElementById("google-signup");
        const showLogin = document.getElementById("auth-show-login");
        const closeBtn = document.getElementById("auth-close");
        const usernameInput = document.getElementById("register-username") as HTMLInputElement;
        const usernameCheck = document.getElementById("username-check");

        // Проверка доступности username в реальном времени
        let checkTimeout: NodeJS.Timeout;
        usernameInput?.addEventListener("input", async () => {
            clearTimeout(checkTimeout);
            const username = usernameInput.value.trim();

            if (username.length < 3) {
                usernameCheck!.style.display = "none";
                return;
            }

            checkTimeout = setTimeout(async () => {
                const isAvailable = await firebaseService.checkUsernameAvailability(username);
                if (usernameCheck) {
                    usernameCheck.style.display = "block";
                    usernameCheck.textContent = isAvailable ? "✓ Доступен" : "✗ Занят";
                    usernameCheck.className = isAvailable ? "username-check available" : "username-check taken";
                }
            }, 500);
        });

        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            console.log("[AuthUI] Register form submitted");

            const username = usernameInput?.value.trim();
            const email = (document.getElementById("register-email") as HTMLInputElement)?.value;
            const password = (document.getElementById("register-password") as HTMLInputElement)?.value;
            const passwordConfirm = (document.getElementById("register-password-confirm") as HTMLInputElement)?.value;

            console.log("[AuthUI] Registration data:", {
                username: username?.substring(0, 3) + "...",
                email: email?.substring(0, 3) + "...",
                hasPassword: !!password,
                hasPasswordConfirm: !!passwordConfirm
            });

            if (!username || !email || !password || !passwordConfirm) {
                console.warn("[AuthUI] Validation failed: missing fields");
                this.showError("Заполните все поля");
                return;
            }

            if (password !== passwordConfirm) {
                console.warn("[AuthUI] Validation failed: passwords don't match");
                this.showError("Пароли не совпадают");
                return;
            }

            if (password.length < 6) {
                console.warn("[AuthUI] Validation failed: password too short");
                this.showError("Пароль должен быть не менее 6 символов");
                return;
            }

            console.log("[AuthUI] Checking username availability...");
            const isAvailable = await firebaseService.checkUsernameAvailability(username);
            if (!isAvailable) {
                console.warn("[AuthUI] Username not available:", username);
                this.showError("Имя пользователя уже занято");
                return;
            }
            console.log("[AuthUI] Username available:", username);

            const submitBtn = document.getElementById("register-submit") as HTMLButtonElement;
            submitBtn.disabled = true;
            submitBtn.textContent = "РЕГИСТРАЦИЯ...";

            console.log("[AuthUI] Calling firebaseService.signUpWithEmail...");
            const result = await firebaseService.signUpWithEmail(email, password, username);
            console.log("[AuthUI] Registration result:", result.success ? "SUCCESS" : "FAILED", result.error || "");

            if (result.success) {
                console.log("[AuthUI] Registration successful!");
                this.showError("", false);
                this.showSuccess("Регистрация успешна! Проверьте email для верификации.");
                setTimeout(() => {
                    this.hide();
                    if (this.callbacks.onAuthSuccess) {
                        console.log("[AuthUI] Calling onAuthSuccess callback");
                        this.callbacks.onAuthSuccess();
                    }
                }, 2000);
            } else {
                console.error("[AuthUI] Registration failed:", result.error);
                this.showError(result.error || "Ошибка регистрации");
                submitBtn.disabled = false;
                submitBtn.textContent = "ЗАРЕГИСТРИРОВАТЬСЯ";
            }
        });

        googleBtn?.addEventListener("click", async () => {
            const btn = googleBtn as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = "РЕГИСТРАЦИЯ...";

            const result = await firebaseService.signInWithGoogle();

            if (result.success) {
                this.hide();
                if (this.callbacks.onAuthSuccess) {
                    this.callbacks.onAuthSuccess();
                }
            } else {
                this.showError(result.error || "Ошибка регистрации через Google");
                btn.disabled = false;
                btn.innerHTML = '<span class="google-icon">G</span> Зарегистрироваться через Google';
            }
        });

        showLogin?.addEventListener("click", (e) => {
            e.preventDefault();
            this.showLoginForm(this.callbacks);
        });

        closeBtn?.addEventListener("click", () => {
            this.hide();
        });
    }

    /**
     * Привязка обработчиков для формы восстановления пароля
     */
    private attachResetHandlers(): void {
        const form = document.getElementById("reset-form") as HTMLFormElement;
        const showLogin = document.getElementById("auth-show-login");
        const closeBtn = document.getElementById("auth-close");

        form?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = (document.getElementById("reset-email") as HTMLInputElement)?.value;

            if (!email) {
                this.showError("Введите email");
                return;
            }

            const submitBtn = document.getElementById("reset-submit") as HTMLButtonElement;
            submitBtn.disabled = true;
            submitBtn.textContent = "ОТПРАВКА...";

            const result = await firebaseService.sendPasswordResetEmail(email);

            if (result.success) {
                this.showError("", false);
                this.showSuccess("Письмо для сброса пароля отправлено на " + email);
                submitBtn.disabled = false;
                submitBtn.textContent = "ОТПРАВИТЬ";
            } else {
                this.showError(result.error || "Ошибка отправки письма");
                submitBtn.disabled = false;
                submitBtn.textContent = "ОТПРАВИТЬ";
            }
        });

        showLogin?.addEventListener("click", (e) => {
            e.preventDefault();
            this.showLoginForm(this.callbacks);
        });

        closeBtn?.addEventListener("click", () => {
            this.hide();
        });
    }

    /**
     * Привязка обработчиков для профиля пользователя
     */
    private attachProfileHandlers(): void {
        const signOutBtn = document.getElementById("auth-signout");
        const resendBtn = document.getElementById("resend-verification");
        const closeBtn = document.getElementById("auth-close");

        signOutBtn?.addEventListener("click", async () => {
            await firebaseService.signOut();
            this.hide();
            if (this.callbacks.onAuthSuccess) {
                this.callbacks.onAuthSuccess();
            }
        });

        resendBtn?.addEventListener("click", async () => {
            const btn = resendBtn as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = "ОТПРАВКА...";

            const result = await firebaseService.sendEmailVerification();

            if (result.success) {
                this.showSuccess("Письмо для верификации отправлено");
            } else {
                this.showError(result.error || "Ошибка отправки письма");
            }

            btn.disabled = false;
            btn.textContent = "Отправить письмо для верификации";
        });

        closeBtn?.addEventListener("click", () => {
            this.hide();
        });
    }

    /**
     * Показать ошибку
     */
    private showError(message: string, isError: boolean = true): void {
        const errorDiv = document.getElementById("auth-error");
        if (errorDiv) {
            if (message) {
                errorDiv.textContent = message;
                errorDiv.style.display = "block";
                errorDiv.className = isError ? "auth-error" : "auth-success";
            } else {
                errorDiv.style.display = "none";
            }
        }
    }

    /**
     * Показать успешное сообщение
     */
    private showSuccess(message: string): void {
        const successDiv = document.getElementById("auth-success");
        if (successDiv) {
            successDiv.textContent = message;
            successDiv.style.display = "block";
        }
    }

    /**
     * Получить контейнер
     */
    getContainer(): HTMLDivElement | null {
        return this.container;
    }
}

// LAZY SINGLETON
let _authUIInstance: AuthUI | null = null;

export function getAuthUI(): AuthUI {
    if (!_authUIInstance) {
        _authUIInstance = new AuthUI();
    }
    return _authUIInstance;
}

export const authUI: AuthUI = new Proxy({} as AuthUI, {
    get(_target, prop) {
        const instance = getAuthUI();
        const value = (instance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(instance);
        }
        return value;
    },
    set(_target, prop, value) {
        const instance = getAuthUI();
        (instance as any)[prop] = value;
        return true;
    }
});

