# Third-party notice: passphrase word list

`effWordlist.ts` contains the **EFF Large Wordlist for Passphrases** (7,776 words) by the
Electronic Frontier Foundation, <https://www.eff.org/dice>, downloaded from
<https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt>
(sha256 `addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e`).

Licensed under the Creative Commons Attribution 3.0 United States License
(CC BY 3.0 US, <https://creativecommons.org/licenses/by/3.0/us/>). Changes: the dice-roll
column was dropped and the words were embedded as a TypeScript string; the words themselves are
unmodified.

## Passphrase entropy

Account passphrases are 6 words drawn independently and uniformly from the 7,776-word list using
`crypto.randomInt` (CSPRNG, rejection sampling — no modulo bias):

    entropy = 6 × log2(7776) = 6 × 12.925 ≈ 77.5 bits

which exceeds the spec target of ≥ 70 bits. The passphrase is the *only* credential (no username),
so the server stores only `HMAC-SHA256(PASSPHRASE_PEPPER, normalize(passphrase))` (lookup index)
and an scrypt verifier with a per-account salt; plaintext is never stored or logged.
