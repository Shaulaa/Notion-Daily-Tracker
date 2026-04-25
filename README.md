# Notion-Daily-Tracker
Pantau kebiasaan harian kamu dengan sistem yang terinspirasi dari buku Atomic Habits

## Background notification via cron-job.org

Untuk notif tetap jalan saat tab ditutup, project ini memakai endpoint:

`GET /api/cron-send-reminders?secret=CRON_SECRET`

Setup yang dibutuhkan:

1. Set env `CRON_SECRET` di Vercel.
2. Set env Firebase Admin di Vercel, pilih salah satu cara:
   Cara paling mudah:
   `FIREBASE_SERVICE_ACCOUNT_JSON`

   Atau cara manual:
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
3. Buat job di `cron-job.org` yang memanggil:
   `https://your-domain.vercel.app/api/cron-send-reminders?secret=ISI_SECRET_KAMU`
4. Jalankan tiap 5 menit atau sesuai kebutuhan.

Catatan:
- Endpoint juga menerima `Authorization: Bearer <CRON_SECRET>` jika scheduler support custom header.
- Vercel Hobby tidak mendukung cron lebih dari 1x per hari, jadi scheduler eksternal dipakai untuk reminder berkala.
