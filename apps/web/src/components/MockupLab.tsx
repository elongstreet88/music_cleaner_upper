import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

type MockupId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

interface MockChange {
  field: string;
  before: string;
  after: string;
}

interface MockTrack {
  id: string;
  number: string;
  title: string;
  sourceFile: string;
  outputFile: string;
  changes: MockChange[];
}

interface MockAlbum {
  id: string;
  artist: string;
  title: string;
  status: 'Matched' | 'Needs review' | 'Queued';
  trackCount: number;
  changedTracks: number;
  note: string;
  coverTone: string;
  tracks: MockTrack[];
}

interface MockQueueItem {
  title: string;
  album: string;
  eta: string;
  status: 'Running' | 'Queued' | 'Attention';
}

interface MockupDefinition {
  id: MockupId;
  title: string;
  strapline: string;
  summary: string;
  strengths: string[];
  background: string;
}

const mockPaths = {
  source: '/Volumes/Archive/Incoming/Mixed Albums',
  output: '/Volumes/Library/Clean Output/Staging',
};

const mockAlbums: MockAlbum[] = [
  {
    id: 'wall',
    artist: 'Pink Floyd',
    title: 'The Wall',
    status: 'Matched',
    trackCount: 26,
    changedTracks: 26,
    note: 'Cue split normalized into Disc 1 and Disc 2.',
    coverTone: 'from-rose-500/25 via-orange-300/10 to-transparent',
    tracks: [
      {
        id: 'wall-1',
        number: '1.01',
        title: 'In the Flesh?',
        sourceFile: '01. In The Flesh_.flac',
        outputFile: 'Pink Floyd/The Wall/Disc 1/In the Flesh.flac',
        changes: [
          { field: 'Title', before: 'In The Flesh?', after: 'In the Flesh?' },
          { field: 'File', before: '01. In The Flesh_.flac', after: 'In the Flesh.flac' },
        ],
      },
      {
        id: 'wall-2',
        number: '1.03',
        title: 'Another Brick in the Wall, Part 1',
        sourceFile: '03. Another Brick In The Wall (Part 1).flac',
        outputFile: 'Pink Floyd/The Wall/Disc 1/Another Brick in the Wall, Part 1.flac',
        changes: [
          { field: 'Title', before: 'Another Brick In The Wall (Part 1)', after: 'Another Brick in the Wall, Part 1' },
          { field: 'File', before: '03. Another Brick In The Wall (Part 1).flac', after: 'Another Brick in the Wall, Part 1.flac' },
        ],
      },
      {
        id: 'wall-3',
        number: '2.13',
        title: 'Outside the Wall',
        sourceFile: '13. Outside The Wall.flac',
        outputFile: 'Pink Floyd/The Wall/Disc 2/Outside the Wall.flac',
        changes: [
          { field: 'Title', before: 'Outside The Wall', after: 'Outside the Wall' },
          { field: 'File', before: '13. Outside The Wall.flac', after: 'Outside the Wall.flac' },
        ],
      },
    ],
  },
  {
    id: 'mercury',
    artist: 'Imagine Dragons',
    title: 'Mercury - Acts 1 & 2',
    status: 'Needs review',
    trackCount: 32,
    changedTracks: 19,
    note: 'Year and genre are clean; 3 titles still need metadata confirmation.',
    coverTone: 'from-cyan-500/20 via-sky-300/10 to-transparent',
    tracks: [
      {
        id: 'mercury-1',
        number: '1.01',
        title: 'Enemy',
        sourceFile: '01 - Enemy.mp3',
        outputFile: 'Imagine Dragons/Mercury - Acts 1 & 2/Disc 1/Enemy.mp3',
        changes: [{ field: 'Album', before: 'Mercury', after: 'Mercury - Acts 1 & 2' }],
      },
      {
        id: 'mercury-2',
        number: '2.04',
        title: 'Bones',
        sourceFile: '04 Bones.mp3',
        outputFile: 'Imagine Dragons/Mercury - Acts 1 & 2/Disc 2/Bones.mp3',
        changes: [{ field: 'File', before: '04 Bones.mp3', after: 'Bones.mp3' }],
      },
    ],
  },
  {
    id: 'christmas',
    artist: 'Trans-Siberian Orchestra',
    title: 'The Lost Christmas Eve',
    status: 'Queued',
    trackCount: 23,
    changedTracks: 7,
    note: 'Album art will be preserved during MP3 transcode.',
    coverTone: 'from-emerald-500/20 via-lime-300/10 to-transparent',
    tracks: [
      {
        id: 'christmas-1',
        number: '1.07',
        title: 'Wizards in Winter',
        sourceFile: '07 Wizards In Winter.flac',
        outputFile: 'Trans-Siberian Orchestra/The Lost Christmas Eve/Wizards in Winter.mp3',
        changes: [{ field: 'File', before: '07 Wizards In Winter.flac', after: 'Wizards in Winter.mp3' }],
      },
      {
        id: 'christmas-2',
        number: '1.15',
        title: 'Christmas Canon Rock',
        sourceFile: '15 Christmas Canon Rock.flac',
        outputFile: 'Trans-Siberian Orchestra/The Lost Christmas Eve/Christmas Canon Rock.mp3',
        changes: [{ field: 'Format', before: 'FLAC', after: 'MP3 320 kbps' }],
      },
    ],
  },
];

const mockQueue: MockQueueItem[] = [
  { title: 'Pull MusicBrainz metadata', album: 'Imagine Dragons - Mercury - Acts 1 & 2', eta: '18s', status: 'Running' },
  { title: 'Normalize file names', album: 'Pink Floyd - The Wall', eta: '32s', status: 'Queued' },
  { title: 'Preserve album art during transcode', album: 'The Lost Christmas Eve', eta: '2m', status: 'Queued' },
  { title: 'Retry 503 candidate match', album: 'Mercury - Acts 1 & 2', eta: 'Waiting', status: 'Attention' },
];

const mockActivity = [
  'Scanned 7 albums across 4 nested folders.',
  'Recovered from one transient 503 with exponential backoff.',
  'Prepared 120 destination files with title-only naming.',
  '1 album remains flagged for metadata confirmation.',
];

const mockWorkflow = [
  { label: 'Choose folders', state: 'complete' },
  { label: 'Pull metadata', state: 'active' },
  { label: 'Review changes', state: 'pending' },
  { label: 'Save output', state: 'pending' },
];

export const mockupDefinitions: MockupDefinition[] = [
  {
    id: '1',
    title: 'Operator Cockpit',
    strapline: 'Three-panel command center with review in the middle and queue on the right.',
    summary: 'Best when the user wants a strong sense of control and constant visibility into queue state, metadata status, and save readiness.',
    strengths: ['Very clear next action', 'High visibility into system state', 'Good for larger libraries'],
    background: 'from-cyan-500/15 via-base-100 to-base-200',
  },
  {
    id: '2',
    title: 'Accordion Studio',
    strapline: 'Large expanding workflow steps with rich summaries between them.',
    summary: 'Makes progression obvious and keeps each step focused without overwhelming the user with all panels at once.',
    strengths: ['Natural progression', 'Strong focus per step', 'Friendly for first-time users'],
    background: 'from-emerald-500/15 via-base-100 to-base-200',
  },
  {
    id: '3',
    title: 'Wide Review Workbench',
    strapline: 'A stretched workspace optimized around a wide review surface and a floating save bar.',
    summary: 'Designed for users who mostly care about scanning lots of changes quickly with output settings always nearby.',
    strengths: ['Best for wide screens', 'Save controls stay visible', 'Roomy review canvas'],
    background: 'from-amber-500/15 via-base-100 to-base-200',
  },
  {
    id: '4',
    title: 'Queue Board',
    strapline: 'Pipeline-style lanes that show intake, matching, review, and output as separate stages.',
    summary: 'Feels like an operations board. Useful when the process itself matters as much as the final review.',
    strengths: ['Strong process visibility', 'Easy to understand batch progress', 'Good for operator workflows'],
    background: 'from-violet-500/15 via-base-100 to-base-200',
  },
  {
    id: '5',
    title: 'Timeline Flow',
    strapline: 'Vertical timeline with each stage treated like a guided production step.',
    summary: 'Good for users who want a guided flow that feels sequential and reassuring rather than dashboard-heavy.',
    strengths: ['Guided feel', 'Easy mental model', 'Strong progress emphasis'],
    background: 'from-blue-500/15 via-base-100 to-base-200',
  },
  {
    id: '6',
    title: 'Inspector Shell',
    strapline: 'Sidebar album navigator, central review surface, and persistent right inspector.',
    summary: 'Best when the user wants to drill into one album at a time with a professional inspector-style layout.',
    strengths: ['Great single-album focus', 'Persistent details pane', 'Feels desktop-native'],
    background: 'from-teal-500/15 via-base-100 to-base-200',
  },
  {
    id: '7',
    title: 'Batch Console',
    strapline: 'Throughput-first design with jobs, logs, queue, and review snapshots in one surface.',
    summary: 'This is the densest operations-heavy concept for users who want a production console rather than a wizard.',
    strengths: ['Excellent for batch operators', 'High information density', 'Logs stay close'],
    background: 'from-rose-500/15 via-base-100 to-base-200',
  },
  {
    id: '8',
    title: 'Album Spotlight',
    strapline: 'Big visual hero focused on one selected album, with actions docked close by.',
    summary: 'If the product should feel more premium and less like a utility, this layout leans into a spotlight experience.',
    strengths: ['Strong visual identity', 'Comfortable for deliberate review', 'Album context is obvious'],
    background: 'from-fuchsia-500/15 via-base-100 to-base-200',
  },
  {
    id: '9',
    title: 'Dense Operations Desk',
    strapline: 'Compact multi-panel layout for users who prefer everything visible at once.',
    summary: 'A power-user concept where the cost is visual calm but the payoff is constant awareness across the whole workflow.',
    strengths: ['Maximum information density', 'Strong at-a-glance control', 'Great on big monitors'],
    background: 'from-slate-500/15 via-base-100 to-base-200',
  },
  {
    id: '10',
    title: 'Publishing Desk',
    strapline: 'Approval-first flow with explicit exceptions, outputs, and final publish controls.',
    summary: 'Useful if saving output should feel like a publishing action with confidence checks and a final release posture.',
    strengths: ['Clear end-state confidence', 'Excellent save visibility', 'Feels intentional and complete'],
    background: 'from-lime-500/15 via-base-100 to-base-200',
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-[28px] border border-base-300 bg-base-100/88 p-5 shadow-xl shadow-base-300/10 backdrop-blur', className)}>{children}</section>;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-base-content/45">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-base-content/60">{detail}</div>
    </div>
  );
}

function WorkflowSteps({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className={cn('gap-3', vertical ? 'grid' : 'grid md:grid-cols-4')}>
      {mockWorkflow.map((step, index) => (
        <div className="rounded-2xl border border-base-300 bg-base-100/75 px-4 py-3" key={step.label}>
          <div className="flex items-center gap-3">
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold', step.state === 'complete' ? 'bg-success/20 text-success' : step.state === 'active' ? 'bg-primary/20 text-primary' : 'bg-base-300/70 text-base-content/55')}>
              {index + 1}
            </div>
            <div>
              <div className="text-sm font-semibold">{step.label}</div>
              <div className="text-xs text-base-content/55">{step.state === 'complete' ? 'Done' : step.state === 'active' ? 'Active now' : 'Waiting'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourcePanel() {
  return (
    <Surface>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Source</div>
          <h3 className="mt-2 text-lg font-semibold">Choose folders</h3>
        </div>
        <button className="btn btn-outline btn-sm" type="button">Browse</button>
      </div>
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-base-300 bg-base-200/55 px-4 py-3">
          <div className="text-xs text-base-content/50">Folder to analyze</div>
          <div className="mt-1 break-all font-mono text-sm">{mockPaths.source}</div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-200/55 px-4 py-3">
          <div className="text-xs text-base-content/50">Output folder</div>
          <div className="mt-1 break-all font-mono text-sm">{mockPaths.output}</div>
        </div>
      </div>
    </Surface>
  );
}

function MetadataPanel() {
  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Metadata</div>
          <h3 className="mt-2 text-lg font-semibold">Pull and analyze</h3>
          <p className="mt-1 text-sm text-base-content/60">MusicBrainz with retry-on-503 enabled and title-only output naming.</p>
        </div>
        <button className="btn btn-primary btn-sm" type="button">Pull metadata</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatCard label="Albums" value="7" detail="2 need attention" />
        <StatCard label="Tracks" value="120" detail="104 will change" />
      </div>
    </Surface>
  );
}

function QueuePanel() {
  return (
    <Surface>
      <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Processing queue</div>
      <h3 className="mt-2 text-lg font-semibold">Background activity</h3>
      <div className="mt-4 space-y-3">
        {mockQueue.map((item) => (
          <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3" key={`${item.title}-${item.album}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs text-base-content/55">{item.album}</div>
              </div>
              <span className={cn('badge badge-sm', item.status === 'Running' ? 'badge-primary' : item.status === 'Attention' ? 'badge-warning' : 'badge-ghost')}>
                {item.status}
              </span>
            </div>
            <div className="mt-2 text-xs text-base-content/60">ETA: {item.eta}</div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function ActivityPanel() {
  return (
    <Surface>
      <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Run notes</div>
      <h3 className="mt-2 text-lg font-semibold">Recent activity</h3>
      <div className="mt-4 space-y-2">
        {mockActivity.map((item) => (
          <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3 text-sm text-base-content/75" key={item}>{item}</div>
        ))}
      </div>
    </Surface>
  );
}

function AlbumCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('grid gap-3', compact ? 'lg:grid-cols-2' : '')}>
      {mockAlbums.map((album) => (
        <div className="rounded-[24px] border border-base-300 bg-base-100/80 p-4" key={album.id}>
          <div className="flex items-start gap-4">
            <div className={cn('h-20 w-20 shrink-0 rounded-2xl border border-base-300 bg-gradient-to-br', album.coverTone)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-semibold">{album.artist} / {album.title}</h4>
                <span className={cn('badge badge-sm', album.status === 'Matched' ? 'badge-success badge-outline' : album.status === 'Needs review' ? 'badge-warning badge-outline' : 'badge-ghost')}>
                  {album.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-base-content/60">{album.trackCount} tracks · {album.changedTracks} changed</div>
              <div className="mt-2 text-sm text-base-content/70">{album.note}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewStack({ dense = false }: { dense?: boolean }) {
  const tracks = mockAlbums[0].tracks;

  return (
    <div className="space-y-3">
      {tracks.map((track) => (
        <div className="rounded-[24px] border border-base-300 bg-base-100/82 p-4" key={track.id}>
          <div className={cn('gap-4', dense ? 'grid lg:grid-cols-[0.9fr_1.1fr_1fr]' : 'grid xl:grid-cols-[1fr_1.1fr]')}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-ghost badge-sm">{track.number}</span>
                <div className="text-sm font-semibold">{track.title}</div>
              </div>
              <div className="mt-2 break-all font-mono text-xs text-base-content/60">{track.sourceFile}</div>
              {dense ? null : (
                <div className="mt-3 rounded-2xl border border-success/20 bg-success/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-base-content/45">Destination</div>
                  <div className="mt-1 break-all font-mono text-xs text-base-content">{track.outputFile}</div>
                </div>
              )}
            </div>
            <div className={cn('grid gap-2', dense ? '' : 'lg:grid-cols-2')}>
              {track.changes.map((change) => (
                <div className="rounded-2xl border border-base-300 bg-base-200/55 px-3 py-3" key={`${track.id}-${change.field}`}>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-base-content/45">{change.field}</div>
                  <div className="mt-2 text-sm text-error/80">{change.before}</div>
                  <div className="text-xs text-base-content/40">-&gt;</div>
                  <div className="text-sm text-success">{change.after}</div>
                </div>
              ))}
            </div>
            {dense ? (
              <div className="rounded-2xl border border-success/20 bg-success/5 px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-base-content/45">Destination</div>
                <div className="mt-2 break-all font-mono text-xs text-base-content">{track.outputFile}</div>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function SavePanel({ compact = false }: { compact?: boolean }) {
  return (
    <Surface className={compact ? 'p-4' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Output plan</div>
          <h3 className="mt-2 text-lg font-semibold">Ready to save</h3>
          <p className="mt-1 text-sm text-base-content/60">MP3 320 where requested, source copy otherwise, title-only naming, album art preserved.</p>
        </div>
        <button className="btn btn-secondary btn-sm" type="button">Save to output folder</button>
      </div>
      <div className="mt-4 rounded-2xl border border-base-300 bg-base-200/55 px-4 py-3">
        <div className="text-xs text-base-content/50">Destination</div>
        <div className="mt-1 break-all font-mono text-sm">{mockPaths.output}</div>
      </div>
    </Surface>
  );
}

function CommandCenterLayout() {
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <WorkflowSteps vertical />
        <SourcePanel />
        <MetadataPanel />
      </div>
      <div className="space-y-4">
        <Surface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Review workspace</div>
              <h2 className="mt-2 text-xl font-semibold">Album changes</h2>
            </div>
            <span className="badge badge-primary badge-outline">120 file updates</span>
          </div>
          <div className="mt-4"><ReviewStack /></div>
        </Surface>
      </div>
      <div className="space-y-4">
        <SavePanel compact />
        <QueuePanel />
      </div>
    </div>
  );
}

function AccordionStudioLayout() {
  return (
    <div className="space-y-4">
      <WorkflowSteps />
      <div className="space-y-4">
        {[SourcePanel, MetadataPanel, SavePanel].map((Panel, index) => (
          <div className={cn('rounded-[30px] border border-base-300 bg-base-100/88 shadow-xl shadow-base-300/10 transition-all', index === 1 ? 'scale-[1.01]' : '')} key={index}>
            <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
              <div className="p-5"><Panel /></div>
              <div className="border-l border-base-300 p-5">
                {index === 0 ? <AlbumCards compact /> : index === 1 ? <ActivityPanel /> : <ReviewStack />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WideWorkbenchLayout() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Albums" value="7" detail="Nested scanning enabled" />
        <StatCard label="Changes" value="104" detail="Title-only naming" />
        <StatCard label="Retries" value="1" detail="Handled gracefully" />
        <StatCard label="Output" value="Ready" detail="Save bar always visible" />
      </div>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.5fr)_380px]">
        <Surface>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Wide review</div>
              <h2 className="mt-2 text-xl font-semibold">Scan all planned changes quickly</h2>
            </div>
            <button className="btn btn-outline btn-sm" type="button">Search changed fields</button>
          </div>
          <div className="mt-4"><ReviewStack dense /></div>
        </Surface>
        <div className="space-y-4">
          <SourcePanel />
          <MetadataPanel />
          <SavePanel />
        </div>
      </div>
    </div>
  );
}

function QueueBoardLayout() {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {[
        { title: 'Intake', cards: ['Incoming root folder', 'Output destination', 'Nested scan enabled'] },
        { title: 'Matching', cards: ['MusicBrainz lookup', '503 retry backoff', '2 albums completed'] },
        { title: 'Review', cards: ['120 track updates', '3 exceptions', 'Title-only naming'] },
        { title: 'Output', cards: ['Ready to save', 'MP3 + source mix', 'Album art preserved'] },
      ].map((lane, laneIndex) => (
        <Surface className="p-4" key={lane.title}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{lane.title}</h3>
            <span className="badge badge-ghost badge-sm">{laneIndex + 1}</span>
          </div>
          <div className="mt-4 space-y-3">
            {lane.cards.map((card) => (
              <div className="rounded-2xl border border-base-300 bg-base-200/55 px-4 py-3 text-sm" key={card}>{card}</div>
            ))}
            {laneIndex === 2 ? <AlbumCards compact /> : null}
            {laneIndex === 3 ? <SavePanel compact /> : null}
          </div>
        </Surface>
      ))}
    </div>
  );
}

function TimelineLayout() {
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <Surface>
        <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Timeline</div>
        <div className="mt-4 space-y-4">
          {mockWorkflow.map((step, index) => (
            <div className="flex gap-3" key={step.label}>
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold', step.state === 'complete' ? 'bg-success/20 text-success' : step.state === 'active' ? 'bg-primary/20 text-primary' : 'bg-base-300/70 text-base-content/55')}>
                {index + 1}
              </div>
              <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3">
                <div className="text-sm font-semibold">{step.label}</div>
                <div className="text-xs text-base-content/55">{step.state === 'active' ? 'Expanded view on the right' : 'Collapsed summary node'}</div>
              </div>
            </div>
          ))}
        </div>
      </Surface>
      <div className="space-y-4">
        <MetadataPanel />
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Current stage</div>
          <h2 className="mt-2 text-xl font-semibold">Review changes before writing files</h2>
          <div className="mt-4"><ReviewStack /></div>
        </Surface>
      </div>
      <div className="space-y-4">
        <QueuePanel />
        <SavePanel compact />
      </div>
    </div>
  );
}

function InspectorShellLayout() {
  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="tabs tabs-boxed border border-base-300 bg-base-100/75 p-1">
            <a className="tab tab-active">Albums</a>
            <a className="tab">Tracks</a>
            <a className="tab">Queue</a>
          </div>
          <div className="badge badge-neutral badge-outline">Desktop shell concept</div>
        </div>
      </Surface>
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Album navigator</div>
          <div className="mt-4 space-y-3">
            {mockAlbums.map((album, index) => (
              <div className={cn('rounded-2xl border px-4 py-3', index === 0 ? 'border-primary/40 bg-primary/10' : 'border-base-300 bg-base-100/70')} key={album.id}>
                <div className="text-sm font-semibold">{album.artist}</div>
                <div className="text-xs text-base-content/60">{album.title}</div>
              </div>
            ))}
          </div>
        </Surface>
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Selected album review</div>
          <h2 className="mt-2 text-xl font-semibold">Pink Floyd / The Wall</h2>
          <div className="mt-4"><ReviewStack /></div>
        </Surface>
        <div className="space-y-4">
          <MetadataPanel />
          <SavePanel compact />
        </div>
      </div>
    </div>
  );
}

function BatchConsoleLayout() {
  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Console</div>
            <h2 className="mt-2 text-xl font-semibold">Batch operations desk</h2>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" type="button">Retry failed metadata</button>
            <button className="btn btn-secondary btn-sm" type="button">Save output</button>
          </div>
        </div>
      </Surface>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <SourcePanel />
            <MetadataPanel />
          </div>
          <Surface>
            <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Review snapshot</div>
            <div className="mt-4"><ReviewStack dense /></div>
          </Surface>
        </div>
        <div className="space-y-4">
          <QueuePanel />
          <ActivityPanel />
          <SavePanel compact />
        </div>
      </div>
    </div>
  );
}

function AlbumSpotlightLayout() {
  const album = mockAlbums[0];

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_360px]">
      <div className="space-y-4">
        <Surface className="overflow-hidden p-0">
          <div className={cn('grid gap-0 xl:grid-cols-[320px_minmax(0,1fr)] bg-gradient-to-br', album.coverTone)}>
            <div className="min-h-[260px] border-r border-base-300/40" />
            <div className="bg-base-100/88 p-6 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Selected album</div>
                  <h2 className="mt-2 text-3xl font-semibold">{album.artist} / {album.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-base-content/65">{album.note} This concept makes a single album feel important and easy to reason about before anything is written.</p>
                </div>
                <button className="btn btn-secondary btn-sm" type="button">Save this plan</button>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <StatCard label="Tracks" value={String(album.trackCount)} detail="All visible in one place" />
                <StatCard label="Changed" value={String(album.changedTracks)} detail="Most titles normalize casing" />
                <StatCard label="Status" value={album.status} detail="Ready for deliberate review" />
              </div>
            </div>
          </div>
        </Surface>
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Focused review</div>
          <div className="mt-4"><ReviewStack /></div>
        </Surface>
      </div>
      <div className="space-y-4">
        <SourcePanel />
        <MetadataPanel />
        <QueuePanel />
      </div>
    </div>
  );
}

function DenseOperationsDeskLayout() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <div className="grid gap-4 lg:grid-cols-2">
        <SourcePanel />
        <MetadataPanel />
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Album grid</div>
          <div className="mt-4"><AlbumCards compact /></div>
        </Surface>
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Exceptions</div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">Mercury - Acts 1 & 2 still has 3 ambiguous titles.</div>
            <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3 text-sm">All other albums are ready to save immediately.</div>
          </div>
        </Surface>
      </div>
      <div className="space-y-4">
        <SavePanel />
        <QueuePanel />
        <ActivityPanel />
      </div>
    </div>
  );
}

function PublishingDeskLayout() {
  return (
    <div className="space-y-4">
      <WorkflowSteps />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.2fr_0.9fr]">
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Approvals</div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3">
              <div className="text-sm font-semibold">Metadata confidence</div>
              <div className="mt-1 text-xs text-base-content/60">6 albums high confidence, 1 album requires review.</div>
            </div>
            <div className="rounded-2xl border border-base-300 bg-base-100/70 px-4 py-3">
              <div className="text-sm font-semibold">File naming</div>
              <div className="mt-1 text-xs text-base-content/60">Title-only naming applied consistently across all destination files.</div>
            </div>
          </div>
        </Surface>
        <Surface>
          <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Release preview</div>
          <div className="mt-4"><ReviewStack /></div>
        </Surface>
        <div className="space-y-4">
          <QueuePanel />
          <Surface>
            <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Final action</div>
            <h3 className="mt-2 text-lg font-semibold">Publish cleaned library output</h3>
            <p className="mt-2 text-sm text-base-content/60">This concept treats save as a clear publish step, not just a passive footer button.</p>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-outline btn-sm" type="button">Download report</button>
              <button className="btn btn-secondary btn-sm" type="button">Save to output folder</button>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function renderMockupLayout(mockupId: MockupId) {
  switch (mockupId) {
    case '1':
      return <CommandCenterLayout />;
    case '2':
      return <AccordionStudioLayout />;
    case '3':
      return <WideWorkbenchLayout />;
    case '4':
      return <QueueBoardLayout />;
    case '5':
      return <TimelineLayout />;
    case '6':
      return <InspectorShellLayout />;
    case '7':
      return <BatchConsoleLayout />;
    case '8':
      return <AlbumSpotlightLayout />;
    case '9':
      return <DenseOperationsDeskLayout />;
    case '10':
      return <PublishingDeskLayout />;
  }
}

export function MockupLandingPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 p-4 md:p-6">
      <header className="rounded-[32px] border border-base-300 bg-gradient-to-br from-base-100 via-base-100 to-primary/10 p-6 shadow-xl shadow-base-300/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/50">Mockup gallery</div>
            <h1 className="mt-3 text-3xl font-semibold md:text-4xl">10 full-layout workflow concepts</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-base-content/65">These are intentionally mocked pages, not real app states. Each one explores a different way to guide a user from folder selection through metadata review to final save.</p>
          </div>
          <Link className="btn btn-outline btn-sm" to="/">Back to live app</Link>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {mockupDefinitions.map((mockup) => (
          <Link className="group rounded-[30px] border border-base-300 bg-base-100/88 p-5 shadow-xl shadow-base-300/10 transition hover:-translate-y-0.5 hover:shadow-2xl" key={mockup.id} to="/mockup/$mockupId" params={{ mockupId: mockup.id }}>
            <div className={cn('rounded-[24px] border border-base-300 bg-gradient-to-br p-5', mockup.background)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-base-content/45">Mockup {mockup.id}</div>
                  <h2 className="mt-2 text-2xl font-semibold">{mockup.title}</h2>
                </div>
                <span className="badge badge-neutral badge-outline">Mock data</span>
              </div>
              <p className="mt-3 text-sm text-base-content/70">{mockup.strapline}</p>
            </div>

            <div className="mt-4 text-sm text-base-content/65">{mockup.summary}</div>

            <div className="mt-4 flex flex-wrap gap-2">
              {mockup.strengths.map((strength) => (
                <span className="badge badge-ghost badge-sm" key={strength}>{strength}</span>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between text-sm font-medium text-base-content/70">
              <span>Open this concept</span>
              <span className="transition group-hover:translate-x-0.5">-&gt;</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MockupDetailPage({ mockupId }: { mockupId: string }) {
  const mockup = mockupDefinitions.find((item) => item.id === mockupId);

  if (!mockup) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-6">
        <Surface className="max-w-xl text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/50">Mockup not found</div>
          <h1 className="mt-3 text-3xl font-semibold">That concept does not exist</h1>
          <div className="mt-4 flex justify-center gap-2">
            <Link className="btn btn-outline btn-sm" to="/mockup">Back to gallery</Link>
            <Link className="btn btn-secondary btn-sm" to="/">Back to live app</Link>
          </div>
        </Surface>
      </div>
    );
  }

  const currentIndex = mockupDefinitions.findIndex((item) => item.id === mockup.id);
  const previousMockup = mockupDefinitions[currentIndex - 1] ?? null;
  const nextMockup = mockupDefinitions[currentIndex + 1] ?? null;

  return (
    <div className={cn('min-h-screen bg-gradient-to-br', mockup.background)}>
      <div className="mx-auto flex w-full max-w-[1850px] flex-col gap-6 p-4 md:p-6">
        <header className="rounded-[32px] border border-base-300 bg-base-100/88 p-6 shadow-xl shadow-base-300/10 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-neutral badge-outline">Mock data only</span>
                <span className="badge badge-ghost">Mockup {mockup.id}</span>
              </div>
              <h1 className="mt-3 text-3xl font-semibold md:text-4xl">{mockup.title}</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-base-content/65">{mockup.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn btn-outline btn-sm" to="/mockup">All mockups</Link>
              <Link className="btn btn-outline btn-sm" to="/">Live app</Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
            <div className="flex flex-wrap gap-2">
              {mockup.strengths.map((strength) => (
                <span className="badge badge-ghost badge-sm" key={strength}>{strength}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {previousMockup ? <Link className="btn btn-ghost btn-sm" to="/mockup/$mockupId" params={{ mockupId: previousMockup.id }}>Previous</Link> : null}
              {nextMockup ? <Link className="btn btn-secondary btn-sm" to="/mockup/$mockupId" params={{ mockupId: nextMockup.id }}>Next mockup</Link> : null}
            </div>
          </div>
        </header>

        {renderMockupLayout(mockup.id)}
      </div>
    </div>
  );
}