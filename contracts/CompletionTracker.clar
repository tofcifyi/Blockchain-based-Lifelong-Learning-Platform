 
CompletionTracker.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-MODULE-ID u101)
(define-constant ERR-INVALID-USER u102)
(define-constant ERR-COMPLETION-ALREADY-EXISTS u103)
(define-constant ERR-COMPLETION-NOT-FOUND u104)
(define-constant ERR-INVALID-TIMESTAMP u105)
(define-constant ERR-INVALID-PROOF-HASH u106)
(define-constant ERR-INVALID-DIFFICULTY u107)
(define-constant ERR-INVALID-PREREQUISITE u108)
(define-constant ERR-MODULE-NOT-FOUND u109)
(define-constant ERR-USER-NOT-REGISTERED u110)
(define-constant ERR-INVALID-REWARD-AMOUNT u111)
(define-constant ERR-REWARD-DISTRIBUTOR-NOT-SET u112)
(define-constant ERR-ORACLE-NOT-VERIFIED u113)
(define-constant ERR-INVALID-STATUS u114)
(define-constant ERR-MAX-COMPLETIONS-EXCEEDED u115)
(define-constant ERR-INVALID-UPDATE-PARAM u116)
(define-constant ERR-UPDATE-NOT-ALLOWED u117)
(define-constant ERR-INVALID-EXPIRY u118)
(define-constant ERR-INVALID-CATEGORY u119)
(define-constant ERR-INVALID-SCORE u120)

(define-data-var next-completion-id uint u0)
(define-data-var max-completions-per-user uint u100)
(define-data-var reward-distributor-contract (optional principal) none)
(define-data-var oracle-contract (optional principal) none)
(define-data-var admin-principal principal tx-sender)

(define-map completions
  uint
  {
    user: principal,
    module-id: uint,
    completion-time: uint,
    proof-hash: (buff 32),
    difficulty: uint,
    prerequisite: (optional uint),
    status: bool,
    expiry: uint,
    category: (string-utf8 50),
    score: uint
  }
)

(define-map completions-by-user-module
  { user: principal, module-id: uint }
  uint
)

(define-map user-completion-count
  principal
  uint
)

(define-map completion-updates
  uint
  {
    update-time: uint,
    updater: principal,
    new-status: bool,
    new-score: uint
  }
)

(define-read-only (get-completion (id uint))
  (map-get? completions id)
)

(define-read-only (get-completion-by-user-module (user principal) (module-id uint))
  (let ((completion-id (map-get? completions-by-user-module { user: user, module-id: module-id })))
    (match completion-id cid (map-get? completions cid) none)
  )
)

(define-read-only (get-user-completion-count (user principal))
  (default-to u0 (map-get? user-completion-count user))
)

(define-read-only (get-completion-updates (id uint))
  (map-get? completion-updates id)
)

(define-read-only (is-completion-registered (user principal) (module-id uint))
  (is-some (map-get? completions-by-user-module { user: user, module-id: module-id }))
)

(define-private (validate-user (user principal))
  (if (not (is-eq user 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-USER))
)

(define-private (validate-module-id (module-id uint))
  (if (> module-id u0)
    (ok true)
    (err ERR-INVALID-MODULE-ID))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-proof-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    (err ERR-INVALID-PROOF-HASH))
)

(define-private (validate-difficulty (diff uint))
  (if (and (>= diff u1) (<= diff u10))
    (ok true)
    (err ERR-INVALID-DIFFICULTY))
)

(define-private (validate-prerequisite (prereq (optional uint)))
  (match prereq p
    (if (> p u0) (ok true) (err ERR-INVALID-PREREQUISITE))
    (ok true))
)

(define-private (validate-status (status bool))
  (ok true)
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
    (ok true)
    (err ERR-INVALID-EXPIRY))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
    (ok true)
    (err ERR-INVALID-CATEGORY))
)

(define-private (validate-score (score uint))
  (if (and (>= score u0) (<= score u100))
    (ok true)
    (err ERR-INVALID-SCORE))
)

(define-public (set-reward-distributor (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-user contract-principal))
    (asserts! (is-none (var-get reward-distributor-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set reward-distributor-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-oracle-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-user contract-principal))
    (asserts! (is-none (var-get oracle-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-completions-per-user (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID_UPDATE-PARAM))
    (var-set max-completions-per-user new-max)
    (ok true)
  )
)

(define-public (record-completion
  (user principal)
  (module-id uint)
  (proof-hash (buff 32))
  (difficulty uint)
  (prerequisite (optional uint))
  (expiry uint)
  (category (string-utf8 50))
  (score uint)
)
  (let (
    (next-id (var-get next-completion-id))
    (current-count (get-user-completion-count user))
    (distributor (var-get reward-distributor-contract))
    (oracle (var-get oracle-contract))
    (module-exists (ok true)) ;; Assume integration with ModuleRegistry
  )
    (asserts! (is-eq tx-sender user) (err ERR-NOT-AUTHORIZED))
    (try! (validate-user user))
    (try! (validate-module-id module-id))
    (try! (validate-proof-hash proof-hash))
    (try! (validate-difficulty difficulty))
    (try! (validate-prerequisite prerequisite))
    (try! (validate-expiry expiry))
    (try! (validate-category category))
    (try! (validate-score score))
    (asserts! module-exists (err ERR-MODULE-NOT-FOUND))
    (asserts! (not (is-completion-registered user module-id)) (err ERR-COMPLETION-ALREADY-EXISTS))
    (asserts! (< current-count (var-get max-completions-per-user)) (err ERR-MAX-COMPLETIONS-EXCEEDED))
    (asserts! (is-some distributor) (err ERR-REWARD-DISTRIBUTOR-NOT-SET))
    (asserts! (is-some oracle) (err ERR-ORACLE-NOT-VERIFIED))
    ;; Verify prerequisite if exists
    (match prerequisite prereq-id
      (asserts! (is-some (get-completion-by-user-module user prereq-id)) (err ERR-INVALID_PREREQUISITE))
      true
    )
    ;; Oracle verification simulation
    (let ((oracle-principal (unwrap! oracle (err ERR-ORACLE-NOT-VERIFIED))))
      (try! (contract-call? oracle-principal verify-completion user module-id proof-hash))
    )
    (map-set completions next-id
      {
        user: user,
        module-id: module-id,
        completion-time: block-height,
        proof-hash: proof-hash,
        difficulty: difficulty,
        prerequisite: prerequisite,
        status: true,
        expiry: expiry,
        category: category,
        score: score
      }
    )
    (map-set completions-by-user-module { user: user, module-id: module-id } next-id)
    (map-set user-completion-count user (+ current-count u1))
    (var-set next-completion-id (+ next-id u1))
    (let ((distributor-principal (unwrap! distributor (err ERR-REWARD-DISTRIBUTOR-NOT-SET))))
      (try! (contract-call? distributor-principal issue-reward user module-id score))
    )
    (print { event: "completion-recorded", id: next-id })
    (ok next-id)
  )
)

(define-public (update-completion
  (completion-id uint)
  (new-status bool)
  (new-score uint)
)
  (let ((completion (map-get? completions completion-id)))
    (match completion c
      (begin
        (asserts! (is-eq (get user c) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-status new-status))
        (try! (validate-score new-score))
        (asserts! (not (is-eq (get status c) new-status)) (err ERR-INVALID_UPDATE-PARAM))
        (map-set completions completion-id
          (merge c { status: new-status, score: new-score })
        )
        (map-set completion-updates completion-id
          {
            update-time: block-height,
            updater: tx-sender,
            new-status: new-status,
            new-score: new-score
          }
        )
        (print { event: "completion-updated", id: completion-id })
        (ok true)
      )
      (err ERR-COMPLETION-NOT-FOUND)
    )
  )
)

(define-public (get-total-completions)
  (ok (var-get next-completion-id))
)

(define-public (check-completion-existence (user principal) (module-id uint))
  (ok (is-completion-registered user module-id))
)
