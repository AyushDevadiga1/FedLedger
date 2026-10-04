import {
  BookOpen,
  Network,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { StatusPill } from '@/components/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuditTab } from '@/components/tabs/audit'
import { OverviewTab } from '@/components/tabs/overview'
import { TrainingTab } from '@/components/tabs/training'
import { VerifyTab } from '@/components/tabs/verify'
import { useRoundFeed } from '@/hooks/use-round-feed'
import type { FeedStatus } from '@/hooks/use-round-feed'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'overview', label: 'Overview', Icon: BookOpen },
  { id: 'training', label: 'Federation', Icon: Network },
  { id: 'audit', label: 'Ledger', Icon: ScrollText },
  { id: 'verify', label: 'Verify', Icon: ShieldCheck },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  Icon: ComponentType<{ className?: string }>
}>

function feedTone(status: FeedStatus, usingMock: boolean) {
  if (usingMock) return 'idle' as const
  if (status === 'live') return 'ok' as const
  if (status === 'unreachable') return 'off' as const
  return 'idle' as const
}

export function App() {
  const { rounds, status, usingMock, verified, markVerified } = useRoundFeed()
  const logged = rounds.filter((r) => r.onChain).length

  return (
    <TooltipProvider>
      {/* 56px header · 44px tab bar · content — the v1 shell proportions */}
      <div className="grid h-screen grid-rows-[56px_44px_1fr] overflow-hidden">
        <header className="flex items-center justify-between gap-6 border-b border-border bg-card px-6">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-base font-semibold tracking-tight text-primary">
              FedLedger
            </span>
            <span className="text-xs text-subtle">
              Federated learning, auditably
            </span>
          </div>

          <div className="flex items-center gap-6">
            <StatusPill
              label="results"
              tone={feedTone(status, usingMock)}
            />
            <StatusPill label="verify api" tone="idle" />
            <span className="font-mono text-xs text-muted-foreground">
              round{' '}
              <span className="text-foreground">
                {rounds.length ? rounds[rounds.length - 1]!.round : 0}
              </span>{' '}
              / {rounds.length}
            </span>
          </div>
        </header>

        {/* `contents` lets the tab list and the active panel become direct
            grid items of the shell above, instead of nesting a second
            layout inside the row. */}
        <Tabs defaultValue="overview" className="contents">
          <TabsList
            variant="line"
            className="w-full justify-start gap-0 rounded-none border-b border-border bg-card px-4"
          >
            {TABS.map(({ id, label, Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  'h-11 flex-1 justify-start gap-2 rounded-none border-b-2 border-transparent px-4 text-sm',
                  'data-active:border-primary data-active:bg-transparent data-active:text-foreground data-active:shadow-none',
                  'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {label}
                {id === 'audit' && logged > 0 ? (
                  <span className="ml-1 rounded-sm border border-border-strong px-1 font-mono text-xs text-subtle">
                    {logged}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="flex min-h-0 flex-col overflow-hidden">
            <OverviewTab rounds={rounds} verified={verified} />
          </TabsContent>
          <TabsContent value="training" className="flex min-h-0 flex-col overflow-hidden">
            <TrainingTab rounds={rounds} verified={verified} usingMock={usingMock} />
          </TabsContent>
          <TabsContent value="audit" className="flex min-h-0 flex-col overflow-hidden">
            <AuditTab rounds={rounds} verified={verified} />
          </TabsContent>
          <TabsContent value="verify" className="flex min-h-0 flex-col overflow-hidden">
            <VerifyTab rounds={rounds} onVerified={markVerified} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
