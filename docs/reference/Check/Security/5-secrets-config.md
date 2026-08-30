# 5. Secrets & Config hygiene

> [!info] Условные обозначения
> **🤖 В коде** — задаёшь AI: что проверить/реализовать в репозитории.  
> **👤 Вручную** — панели Vercel/Cloudflare/Neon, документ. Делаешь ты.

---

## 🤖 5.3 .env in .gitignore, no secrets in repo/code

**Что сделать в коде (AI):**
- Убедиться, что в `.gitignore` есть `.env`, `.env.local`, `.env.*.local` и что в репозитории нет закоммиченных файлов с секретами.
- В коде не хардкодить API keys, пароли, токены — только чтение из `process.env` (или аналог). Не использовать `NEXT_PUBLIC_` для секретов (они попадут в клиентский бандл).

**Проверка:** Поиск по репо по словам `API_KEY`, `SECRET`, `password` не находит реальных ключей; `.env` не в репо.

---

## 🤖👤 5.4 Secret scanning (обязательно)

> Утечка секрета в коммит необратима — он остаётся в истории git. Поэтому сканирование обязательно, а не опционально.

**Вариант А — в CI (🤖):**
- Добавить в CI шаг [gitleaks](https://github.com/gitleaks/gitleaks) (например `gitleaks/gitleaks-action`), который падает при обнаружении секрета в коммите или истории PR.

**Вариант Б — вручную в репозитории (👤):**
- **GitHub:** **Repository → Settings → Code security and analysis.** Включить **Secret scanning** и **Push protection** (блокирует push с секретом до попадания в историю).

**Рекомендация:** включить оба. Если секрет всё же попал в историю — немедленно ротировать его (см. 5.2), удаление из истории не отменяет ротацию.

**Проверка:** Тестовый коммит с фейковым ключом в формате реального провайдера блокируется push protection или роняет CI.

---

## 👤 5.1 Secrets only in env, separated by envs

**Куда зайти → что сделать:**
- **Vercel:** **Project → Settings → Environment Variables.** Добавить все секреты (Clerk keys, DB URL, Stripe secret, webhook secrets и т.д.) как переменные. Для каждой переменной задать окружения: Production, Preview, Development — и по возможности использовать разные значения для prod и dev/preview.
- **CI (GitHub Actions и т.п.):** Секреты хранить в **Settings → Secrets and variables → Actions**, не в коде workflow.

**Проверка:** В репозитории нет секретов; в Vercel/CI переменные разнесены по окружениям.

---

## 👤 5.2 Rotation runbook exists

**Что сделать вручную (Docs):**
- Написать короткий runbook: как поменять критичные секреты (Clerk keys, Auth secret, DB password, Upstash token, Stripe keys). Для каждого: куда зайти (Clerk Dashboard, Neon, Vercel, Upstash), как сгенерировать новый ключ/пароль, как подставить в env и перезапустить приложение, как отозвать старый ключ при необходимости.
- Хранить в репо (например `docs/runbook-secret-rotation.md`) или в внутренней базе знаний.

**Проверка:** Есть пошаговая инструкция; не «спроси у кого-нибудь».
