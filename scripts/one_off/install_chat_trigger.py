"""One-off: instala trigger Postgres que bumpa chat_threads on message insert.

Idempotente — pode rodar de novo sem efeito colateral.
"""

import json
import urllib.request

URL = "https://srv752536.hstgr.cloud"
SERVICE = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODAzMjIzMjksImV4cCI6MjA5NTY4MjMyOX0."
    "SLqDLs4Ba-P0HekzjeetPUYMVZfWOavJxEz4DC4zOOE"
)

SQL = """
CREATE OR REPLACE FUNCTION public.chat_bump_thread_on_message()
RETURNS TRIGGER AS $func$
BEGIN
  UPDATE public.chat_threads
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at,
      message_count = message_count + 1
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_messages_bump_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_bump_thread
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_bump_thread_on_message();
"""


def main() -> None:
    body = json.dumps({"query": SQL}).encode()
    req = urllib.request.Request(
        f"{URL}/pg/query",
        data=body,
        headers={
            "apikey": SERVICE,
            "Authorization": f"Bearer {SERVICE}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    print(urllib.request.urlopen(req, timeout=15).read().decode())


if __name__ == "__main__":
    main()
