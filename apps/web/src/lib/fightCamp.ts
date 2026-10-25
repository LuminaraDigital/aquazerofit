/**
 * Fight Camp client (AZF-P1): the hooks behind enrolment, squads, cheers,
 * grace and the Share Kit.
 *
 * The status block itself rides GET /fight-record (see useFightCamp in
 * ./fightRecord), so every write here refreshes that one cache entry rather
 * than keeping a second copy of the same state.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EnrolSource, EnrolmentView } from '@aquazerofit/shared';
import { api } from './api';
import { unwrap } from './envelopes';
import { fightRecordKey } from './fightRecord';

export function useEnrol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: EnrolSource) =>
      unwrap<EnrolmentView>(
        await api<unknown>('/fight-camp/enrolments', { method: 'POST', body: { source } }),
        'enrolment',
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: fightRecordKey }),
  });
}
