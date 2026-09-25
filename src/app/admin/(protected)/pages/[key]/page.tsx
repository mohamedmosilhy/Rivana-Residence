import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { pageKeyFromSegment } from "@/application/content/page-commands";
import { requireStaff } from "@/composition/auth";
import { pageCommands } from "@/composition/content";
import { mediaLibrary } from "@/composition/media";
import { SECTION_MEDIA_SLOTS } from "@/domain/media/media-asset";
import {
  PAGE_SECTION_LABELS,
  isSectionPinned,
} from "@/domain/content/page-sections";
import { OrderControls } from "@/presentation/admin/content/order-controls";
import { PublicationPanel } from "@/presentation/admin/content/publication-panel";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { SectionImagesForm } from "@/presentation/admin/media/section-images-form";
import { PageDetailsForm } from "@/presentation/admin/pages/page-details-form";
import { SectionEditor } from "@/presentation/admin/pages/section-editor";
import { Badge } from "@/presentation/admin/ui/badge";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";

import {
  moveSectionAction,
  publishPageAction,
  savePageDetailsAction,
  saveSectionAction,
  saveSectionMediaAction,
  unpublishPageAction,
} from "../actions";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditPagePage({
  params,
}: Readonly<{ params: Promise<{ key: string }> }>) {
  const { key: segment } = await params;
  const key = pageKeyFromSegment(segment);
  if (!key) notFound();
  const { staff, allowed } = await requireStaff(
    `/admin/pages/${segment}`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Edit page" />;

  const [loaded, media] = await Promise.all([
    pageCommands().get(staff, key),
    mediaLibrary().then((library) => library.options(staff)),
  ]);
  if (!loaded.ok) throw new Error("The page is unavailable.");
  const options = media.ok ? media.value : [];
  if (!loaded.value) notFound();
  const { page, readiness, lockedTypes } = loaded.value;
  const sections = page.sections;
  const firstMovable = sections[0]?.type === "HERO" ? 1 : 0;
  const lastMovable =
    sections.at(-1)?.type === "CONTACT_CTA"
      ? sections.length - 2
      : sections.length - 1;

  return (
    <>
      <PageHeader
        title={`${page.title} page`}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Pages", href: "/admin/pages" },
        ]}
      />
      <PublicationPanel
        name={`the ${page.title} page`}
        noun="page"
        status={page.isPublished ? "PUBLISHED" : "DRAFT"}
        readiness={readiness}
        publicPath={page.canonicalPath}
        previewHref={`/admin/pages/${segment}/preview` as Route}
        actions={{
          publish: publishPageAction.bind(null, key),
          unpublish: unpublishPageAction.bind(null, key),
        }}
      />

      <section className="admin-section" aria-labelledby="sections-title">
        <h2 id="sections-title" className="admin-section__title">
          Sections
        </h2>
        <p className="admin-muted admin-section__intro">
          Sections appear on the page in this order. The Hero always comes first
          and the Contact block last; the sections between can move.
        </p>
        <ol className="admin-sections">
          {sections.map((section, index) => {
            const label = PAGE_SECTION_LABELS[section.type];
            const name = section.heading
              ? `${label}: ${section.heading}`
              : label;
            const locked = lockedTypes.includes(section.type);
            return (
              <li key={section.id} className="admin-sections__item">
                <details className="admin-disclosure">
                  <summary>
                    <span className="admin-disclosure__title">
                      {index + 1}. {name}
                    </span>
                    <span className="admin-disclosure__badges">
                      {locked ? <Badge tone="brand">Required</Badge> : null}
                      {section.isVisible ? null : <Badge>Hidden</Badge>}
                    </span>
                  </summary>
                  <div className="admin-disclosure__body">
                    <SectionEditor
                      sectionId={section.id}
                      type={section.type}
                      heading={section.heading}
                      eyebrow={section.eyebrow}
                      isVisible={section.isVisible}
                      locked={locked}
                      payload={section.payload}
                      action={saveSectionAction.bind(null, key, section.id)}
                    />
                    {SECTION_MEDIA_SLOTS[section.type] ? (
                      <SectionImagesForm
                        sectionId={section.id}
                        slots={SECTION_MEDIA_SLOTS[section.type]!}
                        options={options}
                        initial={Object.fromEntries(
                          SECTION_MEDIA_SLOTS[section.type]!.map((slot) => [
                            slot.role,
                            section.media
                              .filter((item) => item.role === slot.role)
                              .map((item) => ({
                                mediaId: item.id,
                                altOverride: item.altOverride,
                              })),
                          ]),
                        )}
                        action={saveSectionMediaAction.bind(
                          null,
                          key,
                          section.id,
                        )}
                      />
                    ) : null}
                  </div>
                </details>
                {isSectionPinned(section.type) ? (
                  <span className="admin-muted admin-sections__pinned">
                    Fixed position
                  </span>
                ) : (
                  <OrderControls
                    id={section.id}
                    name={name}
                    isFirst={index <= firstMovable}
                    isLast={index >= lastMovable}
                    moveUp={moveSectionAction.bind(null, key, section.id, -1)}
                    moveDown={moveSectionAction.bind(null, key, section.id, 1)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <Panel title="Search appearance" titleId="page-details-title" wide>
        <PageDetailsForm
          action={savePageDetailsAction.bind(null, key)}
          seoTitle={page.seoTitle ?? ""}
          seoDescription={page.seoDescription ?? ""}
          ogMediaId={page.ogMediaId}
          options={options}
        />
      </Panel>
    </>
  );
}
