# WidBid — Session Progress File
## Version: S07

---

# IMPORTANT — How to Resume

Open a new chat, send this file and say:
> "Continue from where we left off"

---

# Current Session Progress

## Date: 2026-05-24

## Current Phase: Phase 14 — Owner Dashboard

## Completed Phases:
- Phase 1-9: Core system DONE
- Phase 10: Global Roles DONE
- Phase 11: Points and Store DONE
- Phase 12: Games (Tic Tac Toe - sync bug pending) PARTIAL
- Phase 13: Super Owner Dashboard DONE

## Next Steps:
- Phase 14: Owner Dashboard (public/owner.html)
- Phase 15: Root Dashboard
- Phase 16: Master Dashboard
- Phase 17: Super Admin Dashboard
- Phase 18: Admin Dashboard
- Phase 19: Show roles/colors in chat
- Phase 20: Optimization and Deployment

## Important Notes:
- Run server: node server/index.js
- MySQL has no password
- GitHub: https://github.com/Tamer2beed/widbid (private)
- Super Owner: tamer@test.com / 123456 (id=1)
- Owner: tamer2@2.com / (id=4)
- Super Owner dashboard: http://localhost:3000/superowner.html

---

# Tech Stack
- Backend: Node.js + Express
- Realtime: Socket.io
- Database: MySQL (no password)
- Frontend: HTML + CSS + JavaScript

---

# Project Location
```
C:\Users\Tamer\Documents\widbid
```

---

# File Structure
```
widbid/
├── public/
│   ├── index.html        (Login + Register)
│   ├── rooms.html        (Rooms list)
│   ├── chat.html         (Chat page)
│   ├── game.html         (Tic Tac Toe - sync bug)
│   └── superowner.html   (Super Owner dashboard - DONE)
├── server/
│   ├── index.js
│   ├── db.js
│   ├── middleware.js
│   └── routes/
│       ├── auth.js       (register + login + stats)
│       ├── rooms.js      (list + create + join + kick + setrole)
│       ├── roles.js      (get + assign + revoke + create + update)
│       ├── owner.js      (create owner + createRoom + myRooms + allOwners)
│       ├── users.js      (all + ban + unban)
│       └── points.js     (balance + history + store + buy)
├── .env
├── .gitignore
├── package.json
└── package-lock.json
```

---

# Database Tables

1. users
2. rooms (+ owner_id_global, room_token, max_members)
3. room_members
4. messages
5. global_custom_roles
6. global_roles (9 roles - clean)
7. user_global_roles
8. user_points
9. points_history
10. store_items (6 items)
11. user_purchases
12. owners

## Global Roles (Clean - 9 roles):
| ID | Role | Level | Color |
|----|------|-------|-------|
| 1 | Super Owner | 1000 | #FFD700 |
| 2 | Owner | 950 | #FF8C00 |
| 3 | Root | 900 | #FF4500 |
| 4 | Master | 800 | #9B59B6 |
| 5 | Super Admin | 700 | #E74C3C |
| 6 | Admin | 600 | #3498DB |
| 7 | Moderator | 400 | #2ECC71 |
| 8 | Member | 100 | #ffffff |
| 9 | Guest | 0 | #888888 |

## All Permissions:
- all, manage_staff, manage_rooms, ban_users, view_logs
- monitor, manage_points, manage_store, create_rooms
- delete_rooms, mute_users, kick_users, manage_roles

---

# .env
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=widbid
PORT=3000
JWT_SECRET=widbid_secret_key_2026
```

---

# Users in DB:
| ID | Username | Email |
|----|----------|-------|
| 1 | tamer | tamer@test.com (Super Owner) |
| 3 | tamer1 | tamer@t.com |
| 4 | tamer2 | tamer@2.com (Owner) |
| 5 | tamer3 | tamer@3.com |

---

# Development Order

| Phase | Goal | Status |
|---|---|---|
| 1-9 | Core System | DONE |
| 10 | Global Roles | DONE |
| 11 | Points and Store | DONE |
| 12 | Games System | PARTIAL |
| 13 | Super Owner Dashboard | DONE |
| 14 | Owner Dashboard | IN PROGRESS |
| 15 | Root Dashboard | PENDING |
| 16 | Master Dashboard | PENDING |
| 17 | Super Admin Dashboard | PENDING |
| 18 | Admin Dashboard | PENDING |
| 19 | Roles/Colors in Chat | PENDING |
| 20 | Optimization | PENDING |

---

# Future Feature: Voice & Video System (WebRTC)

## المميزات المطلوبة:
- بث فيديو للمتحدث يظهر لجميع أعضاء الغرفة
- ميكروفون للتحدث داخل الغرفة
- كاميرا للبث المرئي
- قائمة المتحدثين على الجانب
- طلب الكلام من قبل الأعضاء

## نظام الموافقة:
- عضو يطلب الوصول للبث (صوت أو فيديو)
- صاحب الكاميرا/الميكروفون يرى الطلب
- يقوم بقبول أو رفض الطلب
- عند القبول يبدأ البث للعضو

## التقنية المستخدمة:
- WebRTC للبث المباشر
- Socket.io للإشارات (signaling)

## الجداول المطلوبة لاحقاً:
- stream_requests (طلبات البث)
- active_streams (البثوث النشطة)

## المرحلة: Phase 21 (بعد اكتمال لوحات التحكم)
