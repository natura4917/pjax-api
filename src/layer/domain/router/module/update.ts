import { RouterEntity } from '../model/eav/entity';
import { RouterEventLocation } from '../../event/router';
import { FetchResponse } from '../model/eav/value/fetch';
import { blur } from '../module/update/blur';
import { url } from '../module/update/url';
import { title } from '../module/update/title';
import { head } from '../module/update/head';
import { content, separate } from '../module/update/content';
import { css } from '../module/update/css';
import { script } from '../module/update/script';
import { focus } from '../module/update/focus';
import { scroll } from '../module/update/scroll';
import { saveTitle, savePosition, savePjax } from '../../store/path';
import { AtomicPromise } from 'spica/promise';
import { Either, Left } from 'spica/either';
import { HList } from 'spica/hlist';

export function update(
  {
    event,
    config,
    state,
  }: RouterEntity,
  response: FetchResponse,
  seq: 'fetch',
  io: {
    document: Document;
    position: () => { top: number; left: number; };
  }
): AtomicPromise<Either<Error, readonly [HTMLScriptElement[], Promise<HTMLScriptElement[]>]>> {
  const { process } = state;
  const documents = {
    src: response.document,
    dst: io.document,
  };
  return AtomicPromise.resolve(seq)
    .then(process.either)
    // fetch -> unload
    .then(m => m
      .bind(() =>
        separate(documents, config.areas)
          .extract(
            () => Left(new Error(`Failed to separate the areas.`)),
            () => m))
      .fmap(seqA => (
        void window.dispatchEvent(new Event('pjax:unload')),
        config.sequence.unload(seqA, { ...response, url: response.url.reference }))))
    .then(m => Either.sequence(m))
    .then(process.promise)
    .then(m => m
        .bind(seqB =>
          separate(documents, config.areas)
            .fmap(([area]) =>
              [seqB, area] as const)
            .extract(
              () => Left(new Error(`Failed to separate the areas.`)),
              process.either))
        .bind(([seqB, area]) => (
          void config.update.rewrite(documents.src, area),
          separate(documents, config.areas)
            .fmap(([, areas]) =>
              [seqB, areas] as const)
            .extract(
              () => Left(new Error(`Failed to separate the areas.`)),
              process.either))))
    .then(process.promise)
    // unload -> ready
    .then(m => m
      .fmap(([seqB, areas]) =>
        HList()
          .unfold(() => (
            void blur(documents.dst),
            void savePjax(),
            void url(
              new RouterEventLocation(response.url),
              documents.src.title,
              event.type,
              event.source,
              config.replace),
            void savePjax(),
            void title(documents),
            void saveTitle(),
            void head(documents, config.update.head, config.update.ignore),
            process.either(content(documents, areas))
              .fmap(([as, ps]) =>
                [as, AtomicPromise.all(ps)] as const)))
          .unfold(async p => (await p)
            .fmap(async ([areas]) => {
              config.update.css
                ? void css(documents, config.update.ignore)
                : void 0;
              void io.document.dispatchEvent(new Event('pjax:content'));
              const seqC = await config.sequence.content(seqB, areas);
              const ssm = config.update.script
                ? await script(documents, state.scripts, config.update, Math.max(config.fetch.timeout, 1000) * 10, process)
                : await process.either<[HTMLScriptElement[], AtomicPromise<Either<Error, HTMLScriptElement[]>>]>([[], AtomicPromise.resolve(process.either([]))]);
              void focus(event.type, documents.dst);
              void scroll(event.type, documents.dst, {
                hash: event.location.dest.fragment,
                position: io.position,
              });
              void savePosition();
              void io.document.dispatchEvent(new Event('pjax:ready'));
              return [
                ssm
                  .fmap(([ss, ap]) =>
                    [ss, ap.then(m => m.extract())] as const),
                await config.sequence.ready(seqC),
              ] as const;
            })
            .fmap(p =>
              p.then(([m, seqD]) =>
                m.fmap(sst =>
                  [sst, seqD] as const)))
            .extract(err => AtomicPromise.resolve(Left(err))))
          .reverse()))
    .then(process.promise)
    // ready -> load
    .then(m => m
      .fmap(([p1, p2]) => (
        void AtomicPromise.all([p1, p2])
          .then<void>(([m1, m2]) =>
            m1.bind(([, cp]) =>
              m2.fmap(([[, sp], seqD]) =>
                // Asynchronously wait for load completion of elements and scripts.
                void AtomicPromise.all([cp, sp])
                  .then(process.either)
                  .then(m => m
                    .fmap(([events]) => (
                      void window.dispatchEvent(new Event('pjax:load')),
                      void config.sequence.load(seqD, events)))
                    .extract(() => void 0))))
              .extract(() => void 0)),
        p2)))
    .then(m => Either.sequence(m).then(m => m.join()))
    .then(m => m
      .fmap(([sst]) => sst));
}
