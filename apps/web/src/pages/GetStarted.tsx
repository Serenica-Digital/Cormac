import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useContract } from '../api/hooks';
import { useMyRole, can } from '../lib/authz';
import { PageHeader, SetupPending, Spinner } from '../components/kit';
import { loadParsedWorkbook } from '../workbook/store';

/**
 * The setup-stage landing: two steps, told in order. Step 1's done state
 * reads the locally parsed workbook; the workspace's real state (live or
 * not) comes from the server. Setup itself is reserved for roles that can
 * publish the contract; everyone else sees where things stand.
 */
export function GetStarted() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const { role } = useMyRole(workspaceId);
  const workbook = useMemo(() => loadParsedWorkbook(workspaceId), [workspaceId]);
  const workbookShared = workbook !== null;

  if (role === null) {
    return (
      <div className="flex justify-center py-20 text-stone-400">
        <Spinner />
      </div>
    );
  }
  if (!can(role, 'publish_contract')) {
    return <SetupPending workspaceId={workspaceId} live={Boolean(contract.data)} />;
  }

  if (contract.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Your book is live."
          sub="Cormac keeps it current from here. Tell it what happened; approve what's right."
        />
        <Button asChild size="lg">
          <Link to={`/w/${workspaceId}/records`}>Open your book</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Let's set up your book"
        sub="Two steps. Cormac does the heavy lifting — nothing is decided without you."
      />

      <div className="space-y-4">
        <Card className="animate-rise">
          <CardHeader>
            <CardDescription className="text-2xs font-semibold tracking-[0.12em] uppercase">
              Step 1
            </CardDescription>
            <CardTitle className="flex items-center gap-2 font-display text-xl font-[560]">
              Share your workbook
              {workbookShared && (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-ledger-100 text-ledger-700">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-stone-600">
            {workbookShared ? (
              <>
                Cormac has your workbook.{' '}
                <Link
                  to={`/w/${workspaceId}/workbook`}
                  className="text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
                >
                  Share a different one
                </Link>{' '}
                any time.
              </>
            ) : (
              <>
                Bring the spreadsheet your business runs on. Cormac reads its shape — the file
                itself never leaves your browser.
              </>
            )}
          </CardContent>
          {!workbookShared && (
            <CardFooter>
              <Button asChild>
                <Link to={`/w/${workspaceId}/workbook`}>Share your workbook</Link>
              </Button>
            </CardFooter>
          )}
        </Card>

        <Card className="animate-rise">
          <CardHeader>
            <CardDescription className="text-2xs font-semibold tracking-[0.12em] uppercase">
              Step 2
            </CardDescription>
            <CardTitle className="font-display text-xl font-[560]">Talk with Cormac</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-stone-600">
            A short conversation about how you actually work. Cormac asks one thing at a time, then
            proposes how your book should be organized — you approve it before anything is set.
          </CardContent>
          <CardFooter className="flex-wrap gap-x-4 gap-y-2">
            <Button asChild variant={workbookShared ? 'default' : 'outline'}>
              <Link to={`/w/${workspaceId}/interview`}>Start the conversation</Link>
            </Button>
            {!workbookShared && (
              <span className="text-xs text-muted-foreground">
                Better with your workbook shared first — but you can start either way.
              </span>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
