import { NextResponse } from "next/server";
import { z } from "zod";
import type { NegotiationState, TaskId } from "@/lib/types";
import { evaluateBayernTransferApproval } from "@/lib/football/approval";
import { createSaleOffers, inferPlayerImportance } from "@/lib/football/negotiation";
import { previewLoanImpact, previewSaleImpact } from "@/lib/football/decisionImpact";
import { negotiateOutgoingTransfer } from "@/lib/football/valuation";
import { normalizeTactics, tacticalImpact } from "@/lib/simulation/tactics";
import {
  addDecisionEvent,
  buildSimulationSummary,
  completeTask,
  commitSimulationResult,
  getSimulationReadinessIssues,
  persistDerivedScores,
} from "@/lib/simulation/service";
import { defaultTactics } from "@/lib/simulation/tactics";
import {
  addLineup,
  addPlayerDecision,
  addSigning,
  ensureSimulationRecord,
  getStoreSnapshot,
  mutateStore,
  updateSimulationRecord,
} from "@/lib/storage";
import { stableId } from "@/lib/utils";

const actionSchema = z.object({
  action: z.string(),
  taskId: z.string().optional(),
  playerId: z.string().optional(),
  playerIds: z.array(z.string()).optional(),
  player: z.any().optional(),
  players: z.array(z.any()).optional(),
  boardResponse: z
    .object({
      stage: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
  negotiation: z
    .object({
      negotiation: z.object({
        openingFeeEurM: z.number().min(0),
        sellerCounterEurM: z.number().min(0),
        wageDemandTier: z.enum(["low", "mid", "high", "elite", "superstar"]),
        boardStance: z.enum(["approved", "approved_after_negotiation", "needs_sales", "board_review", "rejected"]),
        sellerResistance: z.number().min(0).max(100),
        reasons: z.array(z.string()).optional(),
      }),
      action: z.enum(["accept", "improve", "walk_away"]),
      finalFeeEurM: z.number().min(0).nullable(),
      status: z.enum(["accepted", "improved", "walked_away", "rejected"]),
      message: z.string(),
      reasons: z.array(z.string()),
    })
    .optional(),
  formation: z.string().optional(),
  lineup: z.array(z.object({ slot: z.string(), playerId: z.string() })).optional(),
  tactics: z
    .object({
      pressingIntensity: z.number().min(0).max(100),
      defensiveLineHeight: z.number().min(0).max(100),
      pressingMode: z.enum(["man", "zonal"]),
      fullbackRole: z.enum(["inverted", "balanced", "wide"]),
      wingerWidth: z.number().min(0).max(100),
      buildUpSpeed: z.number().min(0).max(100),
      ballsInBehindRisk: z.number().min(0).max(100),
      counterpressingAggression: z.number().min(0).max(100),
      rotationLevel: z.number().min(0).max(100),
      strikerDropDeep: z.number().min(0).max(100),
      pivotSecurity: z.number().min(0).max(100),
    })
    .optional(),
  setPieces: z
    .object({
      captainId: z.string().nullable(),
      penaltyTakerId: z.string().nullable(),
      freeKickTakerId: z.string().nullable(),
      cornerTakerId: z.string().nullable(),
    })
    .optional(),
  budget: z.number().min(0).max(500).optional(),
});

function uniqueLineupEntries(items: Array<{ slot: string; playerId: string }>) {
  const seenSlots = new Set<string>();
  const seenPlayers = new Set<string>();
  return items.filter((item) => {
    if (seenSlots.has(item.slot) || seenPlayers.has(item.playerId)) return false;
    seenSlots.add(item.slot);
    seenPlayers.add(item.playerId);
    return true;
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ simulationId: string }> },
) {
  const { simulationId } = await context.params;
  await ensureSimulationRecord(simulationId);
  const summary = await buildSimulationSummary(simulationId);
  if (!summary) {
    return NextResponse.json({ error: "Simulation not found" }, { status: 404 });
  }
  return NextResponse.json(summary);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ simulationId: string }> },
) {
  const { simulationId } = await context.params;
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action payload" }, { status: 400 });
  }

  const action = parsed.data.action;
  const store = await getStoreSnapshot();
  const simulation = store.simulations.find((item) => item.id === simulationId);
  if (!simulation) {
    return NextResponse.json({ error: "Simulation not found" }, { status: 404 });
  }

  const timestamp = new Date().toISOString();
  const targetPlayerIds = parsed.data.playerIds?.length ? parsed.data.playerIds : parsed.data.playerId ? [parsed.data.playerId] : [];

  if (action === "completeTask" && parsed.data.taskId) {
    await completeTask(simulationId, parsed.data.taskId as TaskId);
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "updateBudget") {
    const nextBudget = parsed.data.budget;
    if (nextBudget === undefined) {
      return NextResponse.json({ error: "Missing budget" }, { status: 400 });
    }
    const spent = store.simulation_signings
      .filter((item) => item.simulation_id === simulationId)
      .reduce((sum, item) => sum + item.fee_eur, 0);
    const income = store.simulation_player_decisions
      .filter((item) => item.simulation_id === simulationId && item.decision_type === "sell")
      .reduce((sum, item) => sum + (item.fee_eur ?? 0), 0);
    await updateSimulationRecord(simulationId, {
      selected_budget_eur: nextBudget,
      remaining_budget_eur: Math.max(0, nextBudget + income - spent),
    });
    await addDecisionEvent(simulationId, {
      event_type: "budget",
      title: `Budget updated to EUR ${nextBudget}M`,
      description: "The simulation budget was adjusted by the director.",
      impact_json: { budget: nextBudget, spent, income },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "sell" || action === "loan" || action === "keep" || action === "development") {
    if (!targetPlayerIds.length) {
      return NextResponse.json({ error: "Missing playerId(s)" }, { status: 400 });
    }
    const decisionType =
      action === "sell" ? "sell" : action === "loan" ? "loan" : action === "development" ? "development" : "keep";
    const processed: Array<{ playerId: string; name: string; fee: number | null }> = [];
    let budgetDelta = 0;

    for (const playerId of targetPlayerIds) {
      const player = store.players.find((item) => item.id === playerId);
      if (!player) continue;
      const importance = inferPlayerImportance({
        playerImportance: player.player_importance ?? null,
        bayernCategory: player.bayern_category ?? null,
        age: player.age,
        transferValueMinEurM: player.transfer_value_min_eur_m ?? null,
        transferValueMaxEurM: player.transfer_value_max_eur_m ?? null,
        position: player.position,
      });
      const wageTier =
        player.wage_tier ??
        (importance === "core"
          ? "superstar"
          : importance === "starter"
            ? "elite"
            : importance === "rotation"
              ? "high"
              : importance === "development"
                ? "mid"
                : "low");
      const saleOffers =
        action === "sell"
          ? createSaleOffers({
              playerId,
              playerName: player.name,
              transferValueMinEurM: player.transfer_value_min_eur_m ?? null,
              transferValueMaxEurM: player.transfer_value_max_eur_m ?? null,
              playerImportance: importance,
              wageTier,
              boardSaleStance: player.board_sale_stance ?? null,
              age: player.age,
              contractYearsLeft: player.contract_years_left ?? null,
            })
          : null;
      const loanQuote =
        action === "loan"
          ? negotiateOutgoingTransfer(player, {
              squadImportance: player.data_confidence,
              buyerNeed: Math.max(40, 100 - player.data_confidence),
              minutes: player.data_confidence,
              form: player.data_confidence,
            })
          : null;
      const preview =
        action === "sell"
          ? previewSaleImpact({
              playerId,
              playerName: player.name,
              playerImportance: importance,
              wageTier,
              boardSaleStance: player.board_sale_stance ?? null,
              transferFeeEurM: saleOffers ? saleOffers[saleOffers.recommended] : player.transfer_value_max_eur_m ?? 10,
              replacementQuality: player.data_confidence,
              squadDepthBefore: store.players.filter((item) => item.current_club_id === player.current_club_id).length,
              tacticalImportance: Math.max(50, player.data_confidence),
              youthPathwayValue: player.academy_pathway_value ?? 0,
            })
          : action === "loan"
            ? previewLoanImpact({
                playerId,
                playerName: player.name,
                playerImportance: importance,
                wageTier,
                age: player.age,
                pathwayValue: player.academy_pathway_value ?? 0,
                wageCoveragePercent: loanQuote?.wageCoverage ?? 35,
                minutesPromise: importance === "development" || importance === "loan_candidate",
                squadDepthBefore: store.players.filter((item) => item.current_club_id === player.current_club_id).length,
                tacticalImportance: Math.max(50, player.data_confidence),
              })
            : null;
      const fee =
        action === "sell"
          ? saleOffers
            ? saleOffers[saleOffers.recommended]
            : null
          : action === "loan"
          ? loanQuote?.loanFee ?? null
          : null;
      const boardReaction = preview
        ? preview.severity === "danger"
          ? "Board review required"
          : preview.severity === "warning"
          ? "Board wants more clarity"
          : "Board comfortable"
        : null;
      const fanReaction = preview
        ? preview.severity === "danger"
          ? "Fans are unhappy"
          : preview.severity === "warning"
          ? "Fans are cautious"
          : "Fans see the logic"
        : null;
      const negotiationState: NegotiationState | null = preview
        ? preview.severity === "danger"
          ? "board_review"
          : "approved"
        : null;
      const replacementWarning =
        preview && preview.replacementRisk >= 46
          ? "Replacement risk is high enough to keep a backup plan on the table."
          : preview?.replacementRisk && preview.replacementRisk >= 21
          ? "Replacement risk is medium, so a fallback option still matters."
          : null;

      await addPlayerDecision({
        id: stableId("decision", simulationId, playerId, action, timestamp),
        simulation_id: simulationId,
        player_id: playerId,
        player_name: player.name,
        decision_type: decisionType,
        fee_eur: fee,
        is_simulator_estimate: true,
        confidence_score: player.data_confidence,
        notes:
          action === "sell"
            ? `Sale tiers: lowball EUR ${saleOffers?.lowball}m, fair EUR ${saleOffers?.fair}m, premium EUR ${saleOffers?.premium}m. ${preview?.reasons[0] ?? ""}`
            : action === "loan"
            ? `Loan package: fee EUR ${loanQuote?.loanFee}M, wage coverage ${loanQuote?.wageCoverage}%. ${preview?.reasons[0] ?? ""}`
            : action === "development"
            ? "Marked as development priority."
            : "Retained in the active simulation squad.",
        negotiation_state: negotiationState,
        seller_resistance: preview?.replacementRisk ?? null,
        board_reaction: boardReaction,
        fan_reaction: fanReaction,
        replacement_warning: replacementWarning,
        created_at: timestamp,
      });

      if (action === "sell" && fee !== null) {
        budgetDelta += fee;
      }
      processed.push({ playerId, name: player.name, fee });
    }

    if (!processed.length) {
      return NextResponse.json({ error: "No valid players selected" }, { status: 404 });
    }

    if (budgetDelta > 0) {
      await updateSimulationRecord(simulationId, {
        remaining_budget_eur: simulation.remaining_budget_eur + budgetDelta,
      });
    }

    await addDecisionEvent(simulationId, {
      event_type: action,
      title:
        processed.length === 1
          ? `${action === "sell" ? "Sold" : action === "loan" ? "Loaned" : action === "development" ? "Development priority" : "Kept"} ${processed[0].name}`
          : `${processed.length} players ${action === "sell" ? "sold" : action === "loan" ? "loaned" : action === "development" ? "marked for development" : "retained"}`,
      description:
        action === "sell"
          ? `Budget increases by ${budgetDelta ? `EUR ${budgetDelta}M` : "a simulator estimate"}.`
          : action === "loan"
          ? "The selected players leave the active squad on simulator development loans."
          : action === "development"
          ? "The selected players remain in the development pool."
          : "The selected players stay in the active squad.",
      impact_json: { action, playerIds: processed.map((item) => item.playerId), fees: processed.map((item) => item.fee) },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true, processed: processed.length, budgetDelta });
  }

  if (action === "sign" && (parsed.data.player || parsed.data.players?.length)) {
    const playerPayloads = (parsed.data.players?.length ? parsed.data.players : parsed.data.player ? [parsed.data.player] : []) as Array<{
      id: string;
      name: string;
      club: string | null;
      shirtNumber: number | null;
      position: string | null;
      nationality: string | null;
      currentClub: string | null;
      age: number | null;
      fee: number;
      fit: number;
      need: number;
      source: string;
      confidence: number;
      lowConfidence: boolean;
      foot?: string | null;
      contract?: string | null;
      ability?: number | null;
      bayernFit?: number | null;
      keyTraits?: string[];
      inPossessionFit?: string | null;
      outOfPossessionFit?: string | null;
      characterNote?: string | null;
      realism?: string | null;
      verdict?: string | null;
      raw: unknown;
    }>;

    const summary = await buildSimulationSummary(simulationId);
    if (!summary) {
      return NextResponse.json({ error: "Could not load simulation summary" }, { status: 400 });
    }
    const processed: Array<{ id: string; name: string; fee: number; approval: ReturnType<typeof evaluateBayernTransferApproval> }> = [];
    const blocked: Array<{ id: string; name: string; reason: string }> = [];
    let remainingBudget = simulation.remaining_budget_eur;

    for (const player of playerPayloads) {
      const negotiation = parsed.data.negotiation;
      const negotiatedFee = parsed.data.negotiation?.finalFeeEurM ?? player.fee;
      const negotiationOffer = negotiation?.negotiation ?? null;
      if (negotiatedFee > remainingBudget) {
        blocked.push({ id: player.id, name: player.name, reason: "Insufficient budget" });
        continue;
      }

      const approval = evaluateBayernTransferApproval(
        {
          id: player.id,
          name: player.name,
          club: player.club ?? player.currentClub ?? "Unknown",
          shirtNumber: player.shirtNumber,
          ageMin: player.age ?? 25,
          ageMax: player.age ?? 25,
          nationality: player.nationality ?? "Unknown",
          position: player.position ?? "Unknown",
          foot: player.foot ?? "Unknown",
          fee: { min: player.fee, max: player.fee },
          contract: player.contract ?? "uncertain",
          ability: player.ability ?? Math.round(player.confidence / 10),
          bayernFit: player.bayernFit ?? player.fit / 10,
          keyTraits: player.keyTraits ?? [],
          inPossessionFit: player.inPossessionFit ?? "",
          outOfPossessionFit: player.outOfPossessionFit ?? "",
          characterNote: player.characterNote ?? "",
          realism: player.realism ?? "uncertain",
          verdict: player.verdict ?? "",
        },
        summary,
      );

      if (approval.hardBlock) {
        const overrideAttempt = negotiation?.action === "accept" && negotiation.status !== "rejected";
        const fitScore = player.bayernFit ?? player.fit / 10;
        const needScore = player.need ?? 50;
        const feeShare = player.fee / Math.max(1, simulation.selected_budget_eur);
        const severeVeto = approval.vetoReasons.some((reason) => /not interested|club refuses|panic/i.test(reason));
        const wageVetoTooHeavy = approval.vetoReasons.some((reason) => /wage/i.test(reason)) && approval.total < 58;
        const canConvinceBoard =
          overrideAttempt &&
          negotiatedFee <= remainingBudget &&
          approval.total >= 42 &&
          (fitScore >= 7.2 || needScore >= 70) &&
          feeShare <= 0.85 &&
          !severeVeto &&
          !wageVetoTooHeavy;
        if (canConvinceBoard) {
          approval.decision = "Approved after negotiation";
          approval.stage = "board_review";
          approval.hardBlock = false;
          approval.conversationSummary =
            "The board accepts the transfer only as an exceptional case: clear role, controlled wage ladder, and no panic-buy framing.";
        } else {
          blocked.push({ id: player.id, name: player.name, reason: approval.decision });
          continue;
        }
      }

      const duplicate = store.simulation_signings.some(
        (item) =>
          item.simulation_id === simulationId &&
          item.player_external_source === player.source &&
          item.player_external_id === player.id,
      );
      if (duplicate) {
        blocked.push({ id: player.id, name: player.name, reason: "Already signed in this simulation" });
        continue;
      }

      const negotiationState: NegotiationState | null =
        negotiation?.status === "walked_away"
          ? "walked_away"
          : negotiation?.status === "rejected"
            ? "rejected"
            : negotiation?.status === "improved"
              ? "approved"
              : negotiationOffer?.boardStance === "board_review"
                ? "board_review"
                : negotiationOffer?.boardStance === "needs_sales"
                  ? "board_review"
                  : negotiationOffer?.boardStance === "approved"
                    ? "approved"
                    : negotiationOffer?.boardStance === "approved_after_negotiation"
                      ? "approved"
                      : null;

      await addSigning({
        id: stableId("signing", simulationId, player.id, timestamp),
        simulation_id: simulationId,
        player_external_source: player.source,
        player_external_id: player.id,
        player_name: player.name,
        position: player.position,
        nationality: player.nationality,
        current_club: player.currentClub,
        fee_eur: negotiatedFee,
        is_simulator_estimate: true,
        tactical_fit_score: player.bayernFit ? Math.round(player.bayernFit * 10) : player.fit,
        squad_need_score: player.need,
        negotiation_state: negotiationState,
        seller_resistance: negotiationOffer?.sellerResistance ?? approval.total,
        board_reaction:
          negotiationOffer?.boardStance === "rejected"
            ? "Board remains skeptical"
            : negotiationOffer?.boardStance === "needs_sales"
            ? "Board wants sales first"
            : negotiationOffer?.boardStance === "board_review"
            ? "Board review required"
            : "Board accepts the logic",
        fan_reaction:
          approval.total >= 75
            ? "Fans like the direction"
            : approval.total >= 55
            ? "Fans are cautiously optimistic"
            : "Fans are sceptical",
        replacement_warning: previewReplacementWarning(approval),
        raw_json: {
          ...(typeof player.raw === "object" && player.raw !== null ? (player.raw as Record<string, unknown>) : {}),
          approval,
          boardResponse: parsed.data.boardResponse ?? null,
          negotiation: parsed.data.negotiation ?? null,
        },
        created_at: timestamp,
      });

      remainingBudget -= negotiatedFee;
      processed.push({ id: player.id, name: player.name, fee: negotiatedFee, approval });
    }

    if (!processed.length && !blocked.length) {
      return NextResponse.json({ error: "No valid players selected" }, { status: 404 });
    }

    await updateSimulationRecord(simulationId, {
      remaining_budget_eur: remainingBudget,
    });

    await addDecisionEvent(simulationId, {
      event_type: processed.length ? "sign" : "negotiation",
      title:
        processed.length === 1
          ? `Signed ${processed[0].name}`
          : processed.length > 1
            ? `${processed.length} players signed`
            : blocked.length === 1
              ? `Transfer talks with ${blocked[0].name} collapsed`
              : "Transfer talks collapsed",
      description:
        processed.length === 1
          ? `Transfer fee: EUR ${processed[0].fee}M. Approval ${processed[0].approval.total}/100 (${processed[0].approval.decision}).`
          : processed.length > 1
            ? `${processed.length} signings completed, ${blocked.length} blocked by budget or approval.`
            : blocked[0]?.reason ?? "The transfer could not be completed.",
      impact_json: { players: processed, blocked },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({
      ok: processed.length > 0,
      processed: processed.length,
      blocked: blocked.length,
      blockedDetails: blocked,
      budgetDelta: remainingBudget - simulation.remaining_budget_eur,
    });
  }

  if (action === "recordNegotiation") {
    const negotiation = parsed.data.negotiation;
    const player = parsed.data.player as { id?: string; name?: string; source?: string } | undefined;
    await addDecisionEvent(simulationId, {
      event_type: "negotiation",
      title: player?.name ? `Talks paused for ${player.name}` : "Negotiation paused",
      description: negotiation
        ? `${negotiation.message} ${negotiation.reasons?.[0] ?? ""}`.trim()
        : "A negotiation was opened and then abandoned.",
      impact_json: {
        player,
        negotiation,
      },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "setFormation") {
    const lineup = uniqueLineupEntries(parsed.data.lineup ?? []);
    const tactics = normalizeTactics(simulation.tactics_json ?? null);
    const impact = tacticalImpact(tactics);
    await addLineup({
      id: stableId("lineup", simulationId, timestamp),
      simulation_id: simulationId,
      formation: parsed.data.formation ?? "4-2-3-1",
      lineup_json: lineup,
      bench_json: [],
      tactical_score: Math.max(56, Math.min(96, Math.round(68 + impact.control * 0.18 + impact.threat * 0.12 - impact.risk * 0.08))),
      position_fit_score: Math.max(54, Math.min(94, Math.round(66 + impact.chemistry * 0.16 + impact.control * 0.08))),
      created_at: timestamp,
    });
    await updateSimulationRecord(simulationId, {
      formation: parsed.data.formation ?? "4-2-3-1",
    });
    await addDecisionEvent(simulationId, {
      event_type: "formation",
      title: `Formation set to ${parsed.data.formation ?? "4-2-3-1"}`,
      description: "The tactical base is locked and the starting XI is stored.",
      impact_json: { formation: parsed.data.formation, lineup },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "setTactics" && parsed.data.tactics) {
    const tactics = normalizeTactics(parsed.data.tactics);
    await updateSimulationRecord(simulationId, {
      tactics_json: tactics,
    });
    await addDecisionEvent(simulationId, {
      event_type: "tactics",
      title: "Tactics updated",
      description: "Editable Kompany tactical controls were saved to the simulation.",
      impact_json: { tactics, impact: tacticalImpact(tactics) },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "setSetPieces" && parsed.data.setPieces) {
    const latestLineup = [...store.simulation_lineups]
      .filter((item) => item.simulation_id === simulationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    const starterIds = new Set(
      Array.isArray(latestLineup?.lineup_json)
        ? (latestLineup?.lineup_json as Array<{ playerId?: unknown }>).flatMap((item) => {
            if (typeof item.playerId !== "string") return [];
            return [item.playerId];
          })
        : [],
    );
    const sanitizedSetPieces = sanitizeSetPieces(parsed.data.setPieces, starterIds);
    await updateSimulationRecord(simulationId, {
      set_pieces_json: sanitizedSetPieces,
    });
    await addDecisionEvent(simulationId, {
      event_type: "set-pieces",
      title: "Set pieces and captaincy updated",
      description: "Captain, penalty taker, free-kick taker, and corner taker now affect close matches and knockout swings.",
      impact_json: { setPieces: sanitizedSetPieces, lineup: [...starterIds] },
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "undoLast") {
    await mutateStore((current) => {
      const items = [
        ...current.simulation_player_decisions.filter((item) => item.simulation_id === simulationId).map((item) => ({ type: "decision" as const, createdAt: item.created_at, id: item.id })),
        ...current.simulation_signings.filter((item) => item.simulation_id === simulationId).map((item) => ({ type: "signing" as const, createdAt: item.created_at, id: item.id })),
        ...current.simulation_lineups.filter((item) => item.simulation_id === simulationId).map((item) => ({ type: "lineup" as const, createdAt: item.created_at, id: item.id })),
      ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const latest = items.at(-1);
      if (!latest) return;

      if (latest.type === "decision") {
        current.simulation_player_decisions = current.simulation_player_decisions.filter((item) => item.id !== latest.id);
      }
      if (latest.type === "signing") {
        current.simulation_signings = current.simulation_signings.filter((item) => item.id !== latest.id);
      }
      if (latest.type === "lineup") {
        current.simulation_lineups = current.simulation_lineups.filter((item) => item.id !== latest.id);
      }
      current.decision_feed = current.decision_feed.filter((item) => item.simulation_id !== simulationId || item.created_at !== latest.createdAt);
    });

    await addDecisionEvent(simulationId, {
      event_type: "undo",
      title: "Undo applied",
      description: "The most recent decision artifact was removed from the save.",
      impact_json: {},
    });
    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "simulate") {
    const summary = await buildSimulationSummary(simulationId);
    if (!summary) {
      return NextResponse.json({ error: "Could not load simulation" }, { status: 400 });
    }
    const readinessIssues = getSimulationReadinessIssues(summary);
    if (readinessIssues.length) {
      return NextResponse.json({ error: "Simulation setup incomplete", issues: readinessIssues }, { status: 422 });
    }
    const result = await commitSimulationResult(simulationId);
    if (!result) {
      return NextResponse.json({ error: "Could not simulate" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result });
  }

  if (action === "resetSimulation") {
    await mutateStore((current) => {
      current.simulation_player_decisions = current.simulation_player_decisions.filter((item) => item.simulation_id !== simulationId);
      current.simulation_signings = current.simulation_signings.filter((item) => item.simulation_id !== simulationId);
      current.simulation_lineups = current.simulation_lineups.filter((item) => item.simulation_id !== simulationId);
      current.simulation_results = current.simulation_results.filter((item) => item.simulation_id !== simulationId);
      current.decision_feed = current.decision_feed.filter((item) => item.simulation_id !== simulationId);

      const target = current.simulations.find((item) => item.id === simulationId);
      if (!target) return;

      Object.assign(target, {
        selected_budget_eur: 200,
        remaining_budget_eur: 200,
        status: "draft",
        board_confidence: 52,
        fan_confidence: 50,
        data_confidence: 0,
        formation: null,
        tactics_json: defaultTactics,
        set_pieces_json: null,
        completed_tasks: [],
        current_task: null,
        notes: null,
        completed_at: null,
      });
    });

    await persistDerivedScores(simulationId);
    return NextResponse.json({ ok: true, reset: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

function sanitizeSetPieces(
  setPieces: {
    captainId?: string | null;
    penaltyTakerId?: string | null;
    freeKickTakerId?: string | null;
    cornerTakerId?: string | null;
  },
  starterIds: Set<string>,
) {
  const allow = (value: string | null | undefined) => (value && starterIds.has(value) ? value : null);
  return {
    captainId: allow(setPieces.captainId),
    penaltyTakerId: allow(setPieces.penaltyTakerId),
    freeKickTakerId: allow(setPieces.freeKickTakerId),
    cornerTakerId: allow(setPieces.cornerTakerId),
  };
}

function previewReplacementWarning(approval: ReturnType<typeof evaluateBayernTransferApproval>) {
  if (approval.hardBlock || approval.total <= 45) {
    return "Replacement risk is severe enough to keep a strong backup plan in place.";
  }
  if (approval.total <= 60) {
    return "Replacement risk is high enough that Bayern should keep one fallback option ready.";
  }
  if (approval.vetoReasons.some((reason) => /pathway|wage|budget/i.test(reason))) {
    return "The move is manageable, but the squad still needs a clear follow-up plan.";
  }
  return null;
}
