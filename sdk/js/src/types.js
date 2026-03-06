/**
 * @typedef {Object} AgentIdentity
 * @property {string} name - Human-readable agent name
 * @property {string} agentId - Full agent identifier (agent:name@relay)
 * @property {string} publicKey - Ed25519 public key (base64)
 * @property {string} secretKey - Ed25519 secret key (base64)
 */

/**
 * @typedef {Object} When
 * @property {string} [after] - ISO 8601 datetime — earliest acceptable time
 * @property {string} [before] - ISO 8601 datetime — latest acceptable time
 * @property {number} [duration_min] - Desired duration in minutes
 * @property {'earliest'|'latest'|'cheapest'} [prefer] - Scheduling preference
 */

/**
 * @typedef {Object} Where
 * @property {number} lat - Latitude
 * @property {number} lon - Longitude
 * @property {number} radius_km - Search radius in kilometers
 * @property {'provider_location'|'client_location'|'remote'} [mode] - Location mode
 */

/**
 * @typedef {Object} Budget
 * @property {number} max - Maximum budget
 * @property {string} currency - ISO 4217 currency code
 * @property {'cheapest'|'best_rated'|'fastest'} [prefer] - Budget preference
 */

/**
 * @typedef {Object} Intent
 * @property {'book'|'buy'|'rent'|'hire'|'quote'|'info'} action - Intent action
 * @property {string} category - Dot-notation category (e.g. services.beauty.haircut)
 * @property {When} [when] - Temporal constraints
 * @property {Where} [where] - Geographic constraints
 * @property {Budget} [budget] - Budget constraints
 * @property {Object} [specs] - Category-specific parameters
 * @property {string} [category_schema_version] - Optional schema version (v0.2)
 * @property {number} [quantity] - Quantity (default: 1)
 * @property {boolean} [flexible] - Whether constraints are flexible
 */

/**
 * @typedef {Object} Offer
 * @property {number} price - Offered price
 * @property {string} currency - ISO 4217 currency code
 * @property {string} [when] - ISO 8601 proposed datetime
 * @property {number} [duration_min] - Proposed duration in minutes
 * @property {string} [service] - Service description
 * @property {Object} [location] - Provider location details
 * @property {Object} [conditions] - Terms and conditions
 * @property {Array<Object>} [extras_available] - Available add-ons
 */

/**
 * @typedef {Object} Reputation
 * @property {number} deals_completed - Total completed deals
 * @property {number} rating_avg - Average rating (0-5)
 * @property {number} disputes - Number of disputes
 * @property {string} [member_since] - ISO date of membership start
 * @property {boolean} verified - Whether agent is verified
 */

/**
 * @typedef {Object} Settlement
 * @property {'direct'|'escrow_stripe'|'escrow_crypto'|'escrow_relay'|'invoice'} method
 * @property {string} [pay_at] - Payment timing
 */

/**
 * @typedef {Object} SettlementProof
 * @property {'stripe'|'escrow_crypto'|'bank_transfer'|'invoice'|'on_site'|'other'} method
 * @property {string} [reference] - Transaction ID (payment_intent, tx_hash, invoice_id)
 * @property {number} [amount]
 * @property {string} [currency] - ISO 4217
 */

/**
 * @typedef {Object} BusinessProfile
 * @property {string} name - Business display name
 * @property {string[]} categories - Service categories
 * @property {Object} geo - Geographic service area
 * @property {number} geo.lat - Latitude
 * @property {number} geo.lon - Longitude
 * @property {number} geo.radius_km - Service radius in km
 * @property {Object} [hours] - Operating hours per day
 * @property {Object} [min_price] - Minimum prices by currency
 * @property {string[]} [languages] - Supported languages
 * @property {string[]} [payment_methods] - Accepted payment methods
 */

/**
 * @typedef {Object} RFQMessage
 * @property {string} proto - Protocol version
 * @property {'rfq'} type
 * @property {string} id - Message ID (ULID)
 * @property {string|null} ref - Parent message reference
 * @property {string} from - Sender identity
 * @property {number} ts - Unix timestamp
 * @property {number} ttl - Time to live (seconds)
 * @property {string} sig - Ed25519 signature
 * @property {Intent} intent
 */

/**
 * @typedef {Object} BidMessage
 * @property {string} proto
 * @property {'bid'} type
 * @property {string} id
 * @property {string} ref - RFQ ID
 * @property {string} from
 * @property {string} to
 * @property {number} ts
 * @property {number} ttl
 * @property {string} sig
 * @property {Offer} offer
 * @property {Reputation} [reputation]
 */

/**
 * @typedef {Object} DealMessage
 * @property {string} proto
 * @property {'deal'} type
 * @property {string} id
 * @property {string} ref
 * @property {number} ts
 * @property {string} sig
 * @property {Object} deal - Deal details
 */

/**
 * @typedef {Object} BidCommitmentMessage
 * @property {string} type - 'bid_commitment'
 * @property {string} ref - RFQ ID
 * @property {number} bid_count
 * @property {string} bid_ids_hash - 'sha256:...'
 * @property {string} bids_content_hash - 'sha256:...' (v0.2)
 * @property {string} sig
 */

/**
 * @typedef {Object} DealAttestationMessage
 * @property {string} type - 'deal_attestation'
 * @property {string} deal_id
 * @property {string} rfq_id
 * @property {string} client
 * @property {string} provider
 * @property {string} relay
 * @property {number} amount
 * @property {string} currency
 * @property {string} state
 * @property {number} ts
 * @property {string} sig
 */

export {};
