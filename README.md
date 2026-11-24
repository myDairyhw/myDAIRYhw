# שב

אפליקציית RTL בעברית ללימודי תכנות: מערכת קורסים אישית, מטלות ותזכורות במייל.

## תצוגה מקדימה

אפשר לפתוח את `index.html` בדפדפן ולבחור **לראות איך זה עובד**. מצב ההדגמה שומר נתונים ב-localStorage של הדפדפן בלבד; הוא אינו יוצר חשבון ואינו שולח מיילים.

## חיבור Supabase

1. צרי פרויקט ב-Supabase.
2. הריצי את `supabase-schema.sql` ב-SQL Editor.
3. הוסיפי את ה-Project URL ואת ה-publishable/anon key של הפרויקט בשדות `supabaseUrl` ו-`supabaseAnonKey` שב-`config.js`. אלה הפרטים היחידים של Supabase שמותר להגדיר בקוד הדפדפן; לעולם אל תשימי כאן את ה-service role key.
4. בפרויקט Supabase הפעילי אימות Email/Password והגדירי כתובות אתר מותרות (Site URL ו-Redirect URLs) לפני פרסום.
5. פרסמי את קובצי האתר על שירות אחסון סטטי עם HTTPS.

לאחר הגדרת החיבור אפשר ליצור חשבון, להתחבר, להגדיר מערכת קורסים אישית ולנהל מטלות עם תאריכי יעד. בכניסה הראשונה המשתמשת מתבקשת להזין את הקורסים והימים/שעות של השיעורים; ניתן להוסיף כמה שיעורים בכל יום ולערוך את המערכת בהמשך. אם מופעל אימות כתובת מייל, יש לאשר את המייל לפני הכניסה הראשונה.

כל הטבלאות הציבוריות שבסכמה מפעילות RLS: משתמשת יכולה לקרוא ולעדכן רק את הפרופיל שלה, ולקרוא, להוסיף, לעדכן ולמחוק רק את הקורסים והמטלות שלה. היסטוריית התזכורות אישית לקריאה בלבד; רק פונקציית השרת כותבת אליה, כדי למנוע שינוי של רישום השליחה ועקיפת מניעת כפילויות. ה-Edge Function משתמשת במפתח service role בצד השרת בלבד, שאינו נכלל בקובצי האתר.

מטלות נשמרות בנפרד ממערכת הקורסים, עם סוג (הגשה, פרויקט, מבחן או תרגול), תאריך יעד ושעת הגשה אופציונלית. בעת הרצת הסכמה על מסד נתונים קיים, מטלות ישנות מומרות מתאריך שבועי לתאריך הקרוב הבא של אותו יום בשבוע.

## הפעלת תזכורות במייל

שליחת מיילים דורשת פרויקט Supabase Edge Functions, חשבון Resend ודומיין שולח מאומת:

1. פרסמי את `supabase/functions/send-reminders/index.ts` כ-Edge Function בשם `send-reminders`.
2. הגדירי את הסודות `RESEND_API_KEY` ואת `EMAIL_FROM` (למשל `שב <reminders@your-verified-domain.com>`) ב-Supabase. `SUPABASE_URL` ו-`SUPABASE_SERVICE_ROLE_KEY` זמינים לסביבת ה-Edge Function באופן אוטומטי; אין לחשוף אותם בדפדפן.
3. הפעילי את `pg_cron`, `pg_net` ו-`Vault` בפרויקט. שמרי את כתובת ה-Function ואת service role key ב-Vault (החליפי את ערכי הדוגמה; אל תשמרי אותם בקוד האתר):

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-reminders', 'send_reminders_url');
   select vault.create_secret('<service-role-key>', 'send_reminders_service_key');

   select cron.schedule('send-reminders-every-minute', '* * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_reminders_url'),
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'send_reminders_service_key')
       ),
       body := '{}'::jsonb
     );
   $$);
   ```

   ה-Function מאמת את ה-service role key לפני שליחת תזכורות. שמרי אותו ב-Vault בלבד.
4. בדקי את יומני ה-Edge Function ואת סטטוס אימות הדומיין ב-Resend. המייל נשלח רק אם קיימות מטלות שתאריך היעד שלהן הוא היום או מחר, לפי סוג התזכורת; תזכורות "היום" ו"מחר" נשמרות בנפרד למניעת שליחה חוזרת.

לכל משתמשת נשמרים בנפרד מערכת הקורסים שלה, המטלות, אזור הזמן ושתי שעות תזכורת עצמאיות: שעה למייל עם המטלות להיום ושעה למייל עם המטלות למחר. ה-Cron מפעיל את ה-Edge Function פעם בדקה; הפונקציה בודקת את השעה המקומית של כל משתמשת, ושולחת רק אם השעה תואמת להעדפה שלה ויש מטלות עם תאריך יעד תואם. אפשר להפעיל או לכבות כל סוג תזכורת בנפרד. בהפעלת הסכמה על מסד נתונים קיים, השעה הישנה מועתקת לשני השדות החדשים.
