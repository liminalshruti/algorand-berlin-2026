-- Migration 008 (PROPOSAL) — anchor receipt fields on packets.
--
-- Lands the Berlin AlgoHack "vault receipt fields" task into the vault. The receipt field set is:
-- packet_hash, canonical_version, anchor_txn_id, anchored_at, chain, network, and verifier metadata.
--
-- All columns are nullable and NULL by default: a packet is anchored only by an explicit user
-- action. An un-anchored packet is the common case.
--
-- ⚠ This is the desktop-bound migration drafted from the hackathon slice. Land it in
-- liminal-desktop/src-tauri/src/db/migrations/ after F2/F3/F4/F5 ordering is settled; the number
-- 008 is provisional (007 is the last present migration as of 2026-05-29).

ALTER TABLE packets ADD COLUMN packet_hash       TEXT;  -- SHA-256 hex of canonical packet bytes
ALTER TABLE packets ADD COLUMN canonical_version TEXT;  -- serialization version the hash was taken under
ALTER TABLE packets ADD COLUMN anchor_txn_id     TEXT;  -- Algorand transaction id
ALTER TABLE packets ADD COLUMN anchored_at       TEXT;  -- ISO-8601, block time when available
ALTER TABLE packets ADD COLUMN chain             TEXT;  -- "algorand"
ALTER TABLE packets ADD COLUMN network           TEXT;  -- "testnet" | "localnet" | "mainnet"
ALTER TABLE packets ADD COLUMN verifier_metadata TEXT;  -- JSON: note_schema, confirmed_round, explorer_url, indexer_url, genesis_id

-- One row is anchored at most once; the txn id is the natural unique key when present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_packets_anchor_txn
    ON packets(anchor_txn_id)
    WHERE anchor_txn_id IS NOT NULL;

-- Fast "what's anchored" queries for the vault viewer's audit ribbon.
CREATE INDEX IF NOT EXISTS idx_packets_anchored
    ON packets(anchored_at DESC)
    WHERE anchored_at IS NOT NULL;
