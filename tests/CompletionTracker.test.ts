 

import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, optionalCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_MODULE_ID = 101;
const ERR_INVALID_USER = 102;
const ERR_COMPLETION_ALREADY_EXISTS = 103;
const ERR_COMPLETION_NOT_FOUND = 104;
const ERR_INVALID_PROOF_HASH = 106;
const ERR_INVALID_DIFFICULTY = 107;
const ERR_INVALID_PREREQUISITE = 108;
const ERR_MODULE_NOT_FOUND = 109;
const ERR_USER_NOT_REGISTERED = 110;
const ERR_INVALID_REWARD_AMOUNT = 111;
const ERR_REWARD_DISTRIBUTOR_NOT_SET = 112;
const ERR_ORACLE_NOT_VERIFIED = 113;
const ERR_INVALID_STATUS = 114;
const ERR_MAX_COMPLETIONS_EXCEEDED = 115;
const ERR_INVALID_UPDATE_PARAM = 116;
const ERR_INVALID_EXPIRY = 118;
const ERR_INVALID_CATEGORY = 119;
const ERR_INVALID_SCORE = 120;

interface Completion {
	user: string;
	moduleId: number;
	completionTime: number;
	proofHash: Buffer;
	difficulty: number;
	prerequisite: number | null;
	status: boolean;
	expiry: number;
	category: string;
	score: number;
}

interface CompletionUpdate {
	updateTime: number;
	updater: string;
	newStatus: boolean;
	newScore: number;
}

interface Result<T> {
	ok: boolean;
	value: T;
}

class CompletionTrackerMock {
	state: {
		nextCompletionId: number;
		maxCompletionsPerUser: number;
		rewardDistributorContract: string | null;
		oracleContract: string | null;
		adminPrincipal: string;
		completions: Map<number, Completion>;
		completionsByUserModule: Map<string, number>;
		userCompletionCount: Map<string, number>;
		completionUpdates: Map<number, CompletionUpdate>;
	} = {
		nextCompletionId: 0,
		maxCompletionsPerUser: 100,
		rewardDistributorContract: null,
		oracleContract: null,
		adminPrincipal: "ST1ADMIN",
		completions: new Map(),
		completionsByUserModule: new Map(),
		userCompletionCount: new Map(),
		completionUpdates: new Map(),
	};
	blockHeight: number = 0;
	caller: string = "ST1TEST";
	moduleExists: boolean = true;
	oracleVerified: boolean = true;
	rewardIssued: boolean = true;
	contractCalls: Array<{ contract: string; method: string; args: any[] }> = [];

	constructor() {
		this.reset();
	}

	reset() {
		this.state = {
			nextCompletionId: 0,
			maxCompletionsPerUser: 100,
			rewardDistributorContract: null,
			oracleContract: null,
			adminPrincipal: "ST1ADMIN",
			completions: new Map(),
			completionsByUserModule: new Map(),
			userCompletionCount: new Map(),
			completionUpdates: new Map(),
		};
		this.blockHeight = 0;
		this.caller = "ST1TEST";
		this.moduleExists = true;
		this.oracleVerified = true;
		this.rewardIssued = true;
		this.contractCalls = [];
	}

	setRewardDistributor(contractPrincipal: string): Result<boolean> {
		if (this.caller !== this.state.adminPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (contractPrincipal === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_USER };
		if (this.state.rewardDistributorContract !== null)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.rewardDistributorContract = contractPrincipal;
		return { ok: true, value: true };
	}

	setOracleContract(contractPrincipal: string): Result<boolean> {
		if (this.caller !== this.state.adminPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (contractPrincipal === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_USER };
		if (this.state.oracleContract !== null)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		this.state.oracleContract = contractPrincipal;
		return { ok: true, value: true };
	}

	setMaxCompletionsPerUser(newMax: number): Result<boolean> {
		if (this.caller !== this.state.adminPrincipal)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
		this.state.maxCompletionsPerUser = newMax;
		return { ok: true, value: true };
	}

	recordCompletion(
		user: string,
		moduleId: number,
		proofHash: Buffer,
		difficulty: number,
		prerequisite: number | null,
		expiry: number,
		category: string,
		score: number
	): Result<number> {
		if (this.caller !== user) return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (user === "SP000000000000000000002Q6VF78")
			return { ok: false, value: ERR_INVALID_USER };
		if (moduleId <= 0) return { ok: false, value: ERR_INVALID_MODULE_ID };
		if (proofHash.length !== 32)
			return { ok: false, value: ERR_INVALID_PROOF_HASH };
		if (difficulty < 1 || difficulty > 10)
			return { ok: false, value: ERR_INVALID_DIFFICULTY };
		if (prerequisite !== null && prerequisite <= 0)
			return { ok: false, value: ERR_INVALID_PREREQUISITE };
		if (expiry <= this.blockHeight)
			return { ok: false, value: ERR_INVALID_EXPIRY };
		if (!category || category.length > 50)
			return { ok: false, value: ERR_INVALID_CATEGORY };
		if (score < 0 || score > 100)
			return { ok: false, value: ERR_INVALID_SCORE };
		if (!this.moduleExists) return { ok: false, value: ERR_MODULE_NOT_FOUND };
		const key = `${user}-${moduleId}`;
		if (this.state.completionsByUserModule.has(key))
			return { ok: false, value: ERR_COMPLETION_ALREADY_EXISTS };
		const currentCount = this.state.userCompletionCount.get(user) || 0;
		if (currentCount >= this.state.maxCompletionsPerUser)
			return { ok: false, value: ERR_MAX_COMPLETIONS_EXCEEDED };
		if (!this.state.rewardDistributorContract)
			return { ok: false, value: ERR_REWARD_DISTRIBUTOR_NOT_SET };
		if (!this.state.oracleContract)
			return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };
		if (
			prerequisite !== null &&
			!this.state.completionsByUserModule.has(`${user}-${prerequisite}`)
		) {
			return { ok: false, value: ERR_INVALID_PREREQUISITE };
		}
		if (!this.oracleVerified)
			return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };
		const id = this.state.nextCompletionId;
		const completion: Completion = {
			user,
			moduleId,
			completionTime: this.blockHeight,
			proofHash,
			difficulty,
			prerequisite,
			status: true,
			expiry,
			category,
			score,
		};
		this.state.completions.set(id, completion);
		this.state.completionsByUserModule.set(key, id);
		this.state.userCompletionCount.set(user, currentCount + 1);
		this.state.nextCompletionId++;
		if (!this.rewardIssued)
			return { ok: false, value: ERR_INVALID_REWARD_AMOUNT };
		this.contractCalls.push({
			contract: this.state.rewardDistributorContract,
			method: "issue-reward",
			args: [user, moduleId, score],
		});
		this.contractCalls.push({
			contract: this.state.oracleContract,
			method: "verify-completion",
			args: [user, moduleId, proofHash],
		});
		return { ok: true, value: id };
	}

	getCompletion(id: number): Completion | null {
		return this.state.completions.get(id) || null;
	}

	getCompletionByUserModule(user: string, moduleId: number): Completion | null {
		const key = `${user}-${moduleId}`;
		const id = this.state.completionsByUserModule.get(key);
		return id !== undefined ? this.state.completions.get(id) || null : null;
	}

	getUserCompletionCount(user: string): number {
		return this.state.userCompletionCount.get(user) || 0;
	}

	updateCompletion(
		id: number,
		newStatus: boolean,
		newScore: number
	): Result<boolean> {
		const completion = this.state.completions.get(id);
		if (!completion) return { ok: false, value: ERR_COMPLETION_NOT_FOUND };
		if (completion.user !== this.caller)
			return { ok: false, value: ERR_NOT_AUTHORIZED };
		if (newScore < 0 || newScore > 100)
			return { ok: false, value: ERR_INVALID_SCORE };
		if (completion.status === newStatus)
			return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
		const updated: Completion = {
			...completion,
			status: newStatus,
			score: newScore,
		};
		this.state.completions.set(id, updated);
		this.state.completionUpdates.set(id, {
			updateTime: this.blockHeight,
			updater: this.caller,
			newStatus,
			newScore,
		});
		return { ok: true, value: true };
	}

	getTotalCompletions(): Result<number> {
		return { ok: true, value: this.state.nextCompletionId };
	}

	checkCompletionExistence(user: string, moduleId: number): Result<boolean> {
		const key = `${user}-${moduleId}`;
		return { ok: true, value: this.state.completionsByUserModule.has(key) };
	}
}

describe("CompletionTracker", () => {
	let contract: CompletionTrackerMock;

	beforeEach(() => {
		contract = new CompletionTrackerMock();
		contract.reset();
	});

	it("sets reward distributor successfully", () => {
		contract.caller = "ST1ADMIN";
		const result = contract.setRewardDistributor("ST2DISTRIBUTOR");
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		expect(contract.state.rewardDistributorContract).toBe("ST2DISTRIBUTOR");
	});

	it("rejects setting reward distributor by non-admin", () => {
		const result = contract.setRewardDistributor("ST2DISTRIBUTOR");
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_AUTHORIZED);
	});

	it("sets oracle contract successfully", () => {
		contract.caller = "ST1ADMIN";
		const result = contract.setOracleContract("ST3ORACLE");
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		expect(contract.state.oracleContract).toBe("ST3ORACLE");
	});

	it("sets max completions per user successfully", () => {
		contract.caller = "ST1ADMIN";
		const result = contract.setMaxCompletionsPerUser(50);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		expect(contract.state.maxCompletionsPerUser).toBe(50);
	});

	it("records completion successfully", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		const result = contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(0);
		const completion = contract.getCompletion(0);
		expect(completion?.user).toBe("ST1TEST");
		expect(completion?.moduleId).toBe(1);
		expect(completion?.difficulty).toBe(5);
		expect(completion?.prerequisite).toBeNull();
		expect(completion?.status).toBe(true);
		expect(completion?.expiry).toBe(100);
		expect(completion?.category).toBe("programming");
		expect(completion?.score).toBe(85);
		expect(contract.getUserCompletionCount("ST1TEST")).toBe(1);
		expect(contract.contractCalls).toHaveLength(2);
	});

	it("rejects duplicate completion", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		const result = contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_COMPLETION_ALREADY_EXISTS);
	});

	it("rejects completion without distributor", () => {
		contract.caller = "ST1ADMIN";
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		const result = contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_REWARD_DISTRIBUTOR_NOT_SET);
	});

	it("rejects completion with invalid proof hash", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(31);
		const result = contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_PROOF_HASH);
	});

	it("rejects completion with missing prerequisite", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		const result = contract.recordCompletion(
			"ST1TEST",
			2,
			proofHash,
			5,
			1,
			100,
			"programming",
			85
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_PREREQUISITE);
	});

	it("updates completion successfully", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		const result = contract.updateCompletion(0, false, 90);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		const completion = contract.getCompletion(0);
		expect(completion?.status).toBe(false);
		expect(completion?.score).toBe(90);
		const update = contract.state.completionUpdates.get(0);
		expect(update?.newStatus).toBe(false);
		expect(update?.newScore).toBe(90);
		expect(update?.updater).toBe("ST1TEST");
	});

	it("rejects update by non-user", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		contract.caller = "ST2FAKE";
		const result = contract.updateCompletion(0, false, 90);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_NOT_AUTHORIZED);
	});

	it("rejects update with same status", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		const result = contract.updateCompletion(0, true, 85);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_UPDATE_PARAM);
	});

	it("returns total completions correctly", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		contract.recordCompletion("ST1TEST", 2, proofHash, 6, 1, 200, "math", 95);
		const result = contract.getTotalCompletions();
		expect(result.ok).toBe(true);
		expect(result.value).toBe(2);
	});

	it("checks completion existence correctly", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		const result = contract.checkCompletionExistence("ST1TEST", 1);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(true);
		const result2 = contract.checkCompletionExistence("ST1TEST", 99);
		expect(result2.ok).toBe(true);
		expect(result2.value).toBe(false);
	});

	it("rejects completion with max exceeded", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.setMaxCompletionsPerUser(1);
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			100,
			"programming",
			85
		);
		const result = contract.recordCompletion(
			"ST1TEST",
			2,
			proofHash,
			6,
			1,
			200,
			"math",
			95
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_MAX_COMPLETIONS_EXCEEDED);
	});

	it("rejects invalid expiry", () => {
		contract.caller = "ST1ADMIN";
		contract.setRewardDistributor("ST2DISTRIBUTOR");
		contract.setOracleContract("ST3ORACLE");
		contract.caller = "ST1TEST";
		const proofHash = Buffer.alloc(32);
		contract.blockHeight = 50;
		const result = contract.recordCompletion(
			"ST1TEST",
			1,
			proofHash,
			5,
			null,
			40,
			"programming",
			85
		);
		expect(result.ok).toBe(false);
		expect(result.value).toBe(ERR_INVALID_EXPIRY);
	});
});