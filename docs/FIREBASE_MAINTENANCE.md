# Firebase Database Maintenance

## ⚠️ ВАЖНО: Обновлять каждый месяц!

Firestore в **test mode** истекает через 30 дней. Нужно обновлять правила.

---

## Firestore Security Rules

**Путь:** Firebase Console → Firestore Database → Rules

### Для разработки (test mode):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Для продакшена (с авторизацией):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Checklist при обновлении

- [ ] Зайти в Firebase Console
- [ ] Firestore Database → Rules
- [ ] Обновить дату истечения или правила
- [ ] Нажать **Publish**

---

## Ссылки

- [Firebase Console](https://console.firebase.google.com/project/protocol-tx/firestore)
- [Firestore Rules Docs](https://firebase.google.com/docs/firestore/security/get-started)

---

## Authentication Settings

**Authorized domains** (для OAuth):
- `localhost`
- `protocol-tx.web.app`
- `protocol-tx.firebaseapp.com`

**Sign-in methods** (включить):
- [x] Anonymous
- [x] Google
- [ ] Email/Password (опционально)

---

*Последнее обновление: Январь 2026*
