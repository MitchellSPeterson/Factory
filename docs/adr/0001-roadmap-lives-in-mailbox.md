# Roadmap lives in the Worker mailbox, not in the repo

Roadmap Items are stored in the Worker mailbox (SQLite), like Sessions and Projects. We considered `.factory/roadmap/*.md` files in the Project repo, which would give git history and let agents read the Roadmap directly. We rejected it because every edit (often from the phone) would become a git write and add commit noise, and agents get an item's content anyway when a Session starts from it. The cost: the Roadmap does not travel with the repo and has no history beyond what we record.
