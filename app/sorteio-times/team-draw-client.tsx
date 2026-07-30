"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyTeamDrawAction,
  createInitialTeamDrawState,
  normalizeTeamDrawState,
  type TeamDrawAction,
  type TeamDrawPlayerInput,
  type TeamDrawState,
} from "@/lib/team-draw";

const LOCAL_STORAGE_KEY = "team-draw-state-v1";

function buildTeamsText(state: TeamDrawState): string {
  if (!state.result) return "";

  const lines: string[] = [];

  state.result.teams.forEach((team) => {
    lines.push(`${team.name} (Habilidade total: ${team.totalSkill})`);
    team.players.forEach((player, playerIndex) => {
      const role = player.role ? ` [${player.role}]` : "";
      lines.push(`${playerIndex + 1}. ${player.name}${role}`);
    });
    lines.push("");
  });

  if (state.result.bench.length > 0) {
    lines.push("Reservas");
    state.result.bench.forEach((player, index) => {
      const role = player.role ? ` [${player.role}]` : "";
      lines.push(`${index + 1}. ${player.name}${role}`);
    });
  }

  return lines.join("\n");
}

function parsePlayersCsv(content: string): TeamDrawPlayerInput[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const players: TeamDrawPlayerInput[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",").map((item) => item.trim());
    if (parts.length < 2) continue;

    const [name, skillRaw, roleRaw] = parts;
    const skill = Number(skillRaw);

    if (!name || Number.isNaN(skill)) continue;

    players.push({
      name,
      skill,
      role: roleRaw ? roleRaw : undefined,
    });
  }

  return players;
}

function getInitialState(): TeamDrawState {
  if (typeof window === "undefined") {
    return createInitialTeamDrawState();
  }

  const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!saved) {
    return createInitialTeamDrawState();
  }

  try {
    const parsed = JSON.parse(saved) as TeamDrawState;
    return normalizeTeamDrawState(parsed);
  } catch {
    return createInitialTeamDrawState();
  }
}

export function TeamDrawClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<TeamDrawState>(getInitialState);
  const [name, setName] = useState("");
  const [skill, setSkill] = useState(3);
  const [role, setRole] = useState("");
  const [newRole, setNewRole] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const hasResult = Boolean(state.result);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 3500);
  }, []);

  const runAction = useCallback((action: TeamDrawAction) => {
    try {
      setState((current) => applyTeamDrawAction(current, action));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar os dados";
      showFeedback("error", message);
      return false;
    }
  }, [showFeedback]);

  function handleResetAll() {
    setState(createInitialTeamDrawState());
    showFeedback("success", "Dados do sorteio reiniciados.");
  }

  function handleAddPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      showFeedback("error", "Informe o nome do jogador.");
      return;
    }

    const nextRole = role.trim() || undefined;
    const ok = runAction({
      type: "ADD_PLAYER",
      player: {
        name: nextName,
        skill,
        role: nextRole,
      },
    });

    if (!ok) return;
    setName("");
    showFeedback("success", "Jogador adicionado.");
  }

  async function handleImportCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const players = parsePlayersCsv(content);

      if (players.length === 0) {
        showFeedback("error", "Nenhum jogador válido foi encontrado no CSV.");
        return;
      }

      const ok = runAction({ type: "IMPORT_PLAYERS", players });
      if (!ok) return;

      showFeedback("success", `${players.length} jogadores importados.`);
    } catch {
      showFeedback("error", "Falha ao importar CSV.");
    } finally {
      event.target.value = "";
    }
  }

  function handleAddRole() {
    const nextRole = newRole.trim();
    if (!nextRole) return;

    const ok = runAction({ type: "ADD_ROLE", role: nextRole });
    if (!ok) return;

    setNewRole("");
    showFeedback("success", "Função adicionada.");
  }

  function handleDrawTeams() {
    const ok = runAction({ type: "DRAW_TEAMS" });
    if (!ok) return;

    showFeedback("success", "Times sorteados com sucesso.");
  }

  function handleExportPlayersCsv() {
    if (state.players.length === 0) {
      showFeedback("error", "Não há jogadores para exportar.");
      return;
    }

    const rows = ["Nome,Habilidade,Funcao"];
    state.players.forEach((player) => {
      rows.push(`${player.name},${player.skill},${player.role ?? ""}`);
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jogadores.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleCopyTeams() {
    if (!state.result) {
      showFeedback("error", "Realize um sorteio antes de copiar.");
      return;
    }

    const text = buildTeamsText(state);
    try {
      await navigator.clipboard.writeText(text);
      showFeedback("success", "Times copiados para a area de transferencia.");
    } catch {
      showFeedback("error", "Nao foi possivel copiar os times.");
    }
  }

  const sortedPlayers = useMemo(
    () => [...state.players].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [state.players],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-linear-to-br from-cyan-50 via-white to-blue-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Miniapp</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Sorteio de Times</h1>
            <p className="mt-2 text-sm text-slate-600">Sem sessão: os dados ficam no navegador atual.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleResetAll}
              className="rounded-lg border border-cyan-200 bg-white px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50"
            >
              Novo sorteio
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Importar CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportCsv}
              className="hidden"
            />
          </div>
        </div>
      </section>

      {feedback && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {feedback.message}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Jogadores</h2>
            <p className="mt-1 text-sm text-gray-500">Adicione jogadores com habilidade de 1 a 10.</p>

            <form onSubmit={handleAddPlayer} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nome do jogador"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="number"
                  value={skill}
                  min={1}
                  max={10}
                  onChange={(event) => setSkill(Number(event.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
                >
                  Adicionar
                </button>
              </div>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
              >
                <option value="">Sem funcao</option>
                {state.roleCatalog.map((catalogRole) => (
                  <option key={catalogRole} value={catalogRole}>{catalogRole}</option>
                ))}
              </select>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => runAction({ type: "CLEAR_PLAYERS" })}
                disabled={state.players.length === 0}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Remover todos
              </button>
              <button
                onClick={handleExportPlayersCsv}
                disabled={state.players.length === 0}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Exportar jogadores CSV
              </button>
            </div>

            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-gray-100">
              {sortedPlayers.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Nenhum jogador cadastrado.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {sortedPlayers.map((player) => (
                    <li key={player.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{player.name}</p>
                        <p className="text-xs text-gray-500">Habilidade {player.skill}{player.role ? ` - ${player.role}` : ""}</p>
                      </div>
                      <button
                        onClick={() => runAction({ type: "REMOVE_PLAYER", playerId: player.id })}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Funcoes dinamicas</h2>
            <p className="mt-1 text-sm text-gray-500">Crie as funcoes conforme o esporte (ataque, defesa, goleiro etc.).</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
                placeholder="Nova funcao"
                className="min-w-52 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
              />
              <button
                onClick={handleAddRole}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Adicionar funcao
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {state.roleCatalog.length === 0 ? (
                <span className="text-sm text-gray-500">Nenhuma funcao definida.</span>
              ) : (
                state.roleCatalog.map((catalogRole) => (
                  <button
                    key={catalogRole}
                    onClick={() => runAction({ type: "REMOVE_ROLE", role: catalogRole })}
                    className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                  >
                    {catalogRole} x
                  </button>
                ))
              )}
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Configuracao do sorteio</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-gray-600">
                Numero de times
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={state.settings.teamCount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    runAction({ type: "SET_SETTINGS", settings: { teamCount: value } });
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
              </label>
              <label className="text-sm text-gray-600">
                Jogadores por time
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={state.settings.playersPerTeam}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    runAction({ type: "SET_SETTINGS", settings: { playersPerTeam: value } });
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={state.settings.balanceByRole}
                onChange={(event) => {
                  runAction({ type: "SET_SETTINGS", settings: { balanceByRole: event.target.checked } });
                }}
              />
              Balancear tambem por funcao
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleDrawTeams}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Sortear times
              </button>
              <button
                onClick={() => runAction({ type: "RESET_DRAW" })}
                disabled={!hasResult}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Limpar resultado
              </button>
              <button
                onClick={() => void handleCopyTeams()}
                disabled={!hasResult}
                className="rounded-lg border border-cyan-200 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
              >
                Copiar times
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Resultado</h2>
            {!state.result ? (
              <p className="mt-2 text-sm text-gray-500">Nenhum sorteio realizado ainda.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Diferenca de habilidade entre times: <span className="font-semibold text-gray-900">{state.result.skillSpread}</span>
                </p>

                <div className="grid gap-3">
                  {state.result.teams.map((team, teamIndex) => (
                    <div key={team.name} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{team.name}</h3>
                        <span className="text-xs font-semibold text-cyan-700">Total {team.totalSkill}</span>
                      </div>

                      {team.players.length === 0 ? (
                        <p className="text-xs text-gray-500">Sem jogadores.</p>
                      ) : (
                        <ul className="space-y-2">
                          {team.players.map((player) => (
                            <li key={player.id} className="rounded-lg border border-white bg-white p-2 text-xs text-gray-700">
                              <div className="flex items-center justify-between gap-2">
                                <span>{player.name} ({player.skill}){player.role ? ` - ${player.role}` : ""}</span>
                                <select
                                  className="rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                                  defaultValue=""
                                  onChange={(event) => {
                                    const destination = Number(event.target.value);
                                    if (Number.isNaN(destination)) return;

                                    runAction({
                                      type: "MOVE_PLAYER",
                                      playerId: player.id,
                                      fromTeamIndex: teamIndex,
                                      toTeamIndex: destination,
                                    });

                                    event.target.value = "";
                                  }}
                                >
                                  <option value="">Mover para...</option>
                                  {state.result?.teams.map((destinationTeam, destinationIndex) => (
                                    destinationIndex === teamIndex ? null : (
                                      <option key={`${player.id}-${destinationTeam.name}`} value={destinationIndex}>
                                        {destinationTeam.name}
                                      </option>
                                    )
                                  ))}
                                </select>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>

                {state.result.bench.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <h3 className="font-semibold text-amber-900">Reservas</h3>
                    <p className="mt-1 text-xs text-amber-800">
                      {state.result.bench.map((player) => player.name).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

