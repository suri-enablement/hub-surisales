// @ts-check
/**
 * Painel de Desempenho do Closer · modelo de dados do domínio.
 *
 * Estes tipos são o contrato entre a camada de dados (mock hoje, Salesbud/proxy
 * amanhã) e o resto do painel. Qualquer provider só precisa devolver objetos
 * neste formato para o painel funcionar sem mudanças.
 *
 * Arquivo só de tipos (JSDoc): não exporta nada em tempo de execução.
 */

/** Subcritérios do scorecard do Closer (mesmos blocos do guia em closer/index.html). */
/** @typedef {'abertura' | 'diagnostico' | 'apresentacao' | 'negociacao' | 'fechamento'} DimensionKey */

/** @typedef {Record<DimensionKey, number>} DimensionScores Notas de 0 a 10 por subcritério. */

/**
 * @typedef {Object} Closer
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} team
 */

/**
 * Uma avaliação (da IA ou de uma pessoa) para uma reunião.
 * @typedef {Object} ScoreSet
 * @property {number} overall           Nota geral de 0 a 10.
 * @property {Partial<DimensionScores>} dimensions Notas por subcritério (pode vir incompleto).
 * @property {string} evaluatedAt       ISO 8601.
 * @property {string} [evaluator]       Nome de quem avaliou (humano) ou modelo (IA).
 */

/**
 * @typedef {Object} Evaluation
 * @property {ScoreSet | null} ai       Avaliação automática (IA).
 * @property {ScoreSet | null} human    Avaliação humana (gestor/enablement).
 * @property {string} [feedback]        Feedback rápido (humano, ou resumo da IA).
 * @property {string[]} [highlights]    Pontos fortes citados.
 * @property {string[]} [improvements]  Pontos de melhoria citados.
 */

/** @typedef {'realizada' | 'no_show' | 'cancelada'} MeetingStatus */

/**
 * @typedef {Object} Meeting
 * @property {string} id
 * @property {string} closerId
 * @property {string} date              ISO 8601 do início da reunião.
 * @property {MeetingStatus} status
 * @property {string} leadName
 * @property {string} company
 * @property {number} durationMin
 * @property {string} [recordingUrl]
 * @property {Evaluation | null} evaluation
 */

/** @typedef {'ia+humana' | 'ia' | 'humana'} ScoreSource */

/**
 * Nota final de uma reunião (IA + Humana ponderadas).
 * @typedef {Object} FinalScore
 * @property {number} value
 * @property {ScoreSource} source
 * @property {boolean} provisional      true quando falta uma das duas avaliações.
 * @property {number | null} ai
 * @property {number | null} human
 */

/**
 * Reunião já com a nota final calculada (o que o painel consome).
 * @typedef {Meeting & { score: FinalScore | null }} ScoredMeeting
 */

/** @typedef {'week' | 'month' | 'quarter' | 'year'} Granularity */

/**
 * Intervalo meio-aberto [start, end).
 * @typedef {Object} Period
 * @property {Granularity} granularity
 * @property {Date} start
 * @property {Date} end
 * @property {string} label             Ex.: "Novembro 2026", "Q4 2026".
 * @property {string} shortLabel        Ex.: "nov", "Q4", "sem. 46".
 */

/**
 * Ponto da série temporal.
 * @typedef {Object} Bucket
 * @property {Date} start
 * @property {Date} end
 * @property {string} label
 * @property {string} longLabel
 * @property {number | null} final      Média da nota final (null = sem notas).
 * @property {number | null} ai
 * @property {number | null} human
 * @property {number} count
 * @property {boolean} future           Bucket ainda não aconteceu.
 */

/**
 * @typedef {Object} KpiSummary
 * @property {number | null} average
 * @property {number | null} previousAverage
 * @property {number | null} delta              Diferença absoluta em pontos.
 * @property {number | null} deltaPct           Variação percentual.
 * @property {number | null} aiAverage
 * @property {number | null} humanAverage
 * @property {number} held                      Reuniões realizadas.
 * @property {number} evaluated                 Realizadas com nota final.
 * @property {number} pendingHuman              Com nota só da IA (aguardando humano).
 * @property {number} noShows
 * @property {number | null} coverage           evaluated / held (0..1).
 * @property {number} onTarget                  Reuniões com nota >= meta.
 * @property {number | null} targetRate         onTarget / evaluated (0..1).
 * @property {number | null} previousTargetRate
 */

/**
 * @typedef {Object} DistributionBand
 * @property {string} key
 * @property {string} label
 * @property {number} min                       Inclusivo.
 * @property {number} max                       Exclusivo (exceto a última faixa).
 * @property {number} count
 * @property {number} share                     0..1
 */

/**
 * @typedef {Object} DimensionStat
 * @property {DimensionKey} key
 * @property {string} label
 * @property {number | null} average
 * @property {number | null} previousAverage
 * @property {number | null} delta
 * @property {number | null} ai
 * @property {number | null} human
 */

/**
 * @typedef {Object} QuarterStat
 * @property {string} label
 * @property {Period} period
 * @property {number | null} average
 * @property {number} count
 * @property {boolean} current
 * @property {boolean} future
 */

/** @typedef {'positive' | 'negative' | 'neutral' | 'tip'} InsightTone */

/**
 * @typedef {Object} Insight
 * @property {string} id
 * @property {InsightTone} tone
 * @property {string} title
 * @property {string} body
 * @property {{ label: string, href: string }} [action]
 */

/**
 * @typedef {Object} Level
 * @property {string} key
 * @property {string} name
 * @property {number} min
 * @property {string} emoji
 */

/**
 * @typedef {Object} LevelProgress
 * @property {Level} current
 * @property {Level | null} next
 * @property {number} progress                  0..1 até o próximo nível.
 * @property {number | null} missing            Pontos que faltam para o próximo nível.
 */

/**
 * Tudo que o painel desenha para um closer + período.
 * @typedef {Object} DashboardData
 * @property {Closer} closer
 * @property {Period} period
 * @property {Period} previousPeriod
 * @property {KpiSummary} kpis
 * @property {Bucket[]} trend
 * @property {DistributionBand[]} distribution
 * @property {DimensionStat[]} dimensions
 * @property {QuarterStat[]} quarters
 * @property {ScoredMeeting[]} recent           Reuniões do período, mais recentes primeiro.
 * @property {Insight[]} insights
 * @property {LevelProgress | null} level
 * @property {number | null} teamAverage
 * @property {number[]} sparkline               Médias dos últimos períodos (antigo → atual).
 * @property {number} streak                    Reuniões seguidas na meta até o fim do período.
 */

/**
 * Contrato da camada de dados. Mock hoje; Salesbud (via proxy) na integração.
 * @typedef {Object} ScoresDataProvider
 * @property {string} name
 * @property {(email: string) => Promise<Closer | null>} getCloserByEmail
 * @property {() => Promise<Closer[]>} listClosers
 * @property {(query: MeetingQuery) => Promise<Meeting[]>} listMeetings
 */

/**
 * @typedef {Object} MeetingQuery
 * @property {string} [closerId]                Sem closerId = time todo.
 * @property {Date} from                        Inclusivo.
 * @property {Date} to                          Exclusivo.
 */

export {};
