import React, { useEffect, useState } from "react";
import type { ServiceStatus } from "../types";
import ServiceCard, { ServiceSettingsPatch } from "./ServiceCard";
import { useI18n } from "../i18n/I18nContext";

type Props = {
    services: ServiceStatus[];
    loading: boolean;
    editing: string[];
    setEditing: React.Dispatch<React.SetStateAction<string[]>>;
    saving: boolean;
    onSaveSettings: (svc: ServiceStatus, patch: ServiceSettingsPatch) => void;
    onStart: (name: string) => void;
    onStop: (name: string) => void;
    onDelete: (name: string) => void;
    formatLastActivity: (iso: string) => string;
    allContainers: string[];
};

const ServiceList: React.FC<Props> = ({
    services,
    loading,
    editing,
    setEditing,
    saving,
    onSaveSettings,
    onStart,
    onStop,
    onDelete,
    formatLastActivity,
    allContainers,
}) => {
    const { t } = useI18n();
    const [columnCount, setColumnCount] = useState(1);

    useEffect(() => {
        const updateColumns = () => {
            const width = window.innerWidth || 0;

            let base = 1;
            if (width >= 1300) base = 3;
            else if (width >= 900) base = 2;
            else base = 1;

            const maxColumns =
                services.length > 0 ? Math.min(base, services.length) : 1;

            setColumnCount(maxColumns);
        };

        updateColumns();
        window.addEventListener("resize", updateColumns);
        return () => window.removeEventListener("resize", updateColumns);
    }, [services.length]);

    const columns: ServiceStatus[][] = Array.from(
        { length: columnCount },
        () => [],
    );

    services.forEach((svc, index) => {
        const colIndex = columnCount > 0 ? index % columnCount : 0;
        columns[colIndex].push(svc);
    });

    return (
        <section className="cards-grid">
            {columns.map((columnServices, columnIndex) => (
                <div key={columnIndex} className="cards-column">
                    {columnServices.map((s, cardIndex) => {
                        const isEditing = editing.includes(s.name);

                        const containersUsedByOthers = new Set(
                            services
                                .filter((other) => other.name !== s.name)
                                .flatMap((other) => other.containers || []),
                        );

                        const availableContainers = allContainers.filter(
                            (name) =>
                                name !== "conslee" &&
                                !containersUsedByOthers.has(name),
                        );

                        return (
                            <ServiceCard
                                key={s.name}
                                service={s}
                                isEditing={isEditing}
                                onToggleEditing={() =>
                                    setEditing((prev) =>
                                        prev.includes(s.name)
                                            ? prev.filter((n) => n !== s.name)
                                            : [...prev, s.name],
                                    )
                                }
                                saving={saving}
                                onSaveSettings={onSaveSettings}
                                onStart={onStart}
                                onStop={onStop}
                                onDelete={onDelete}
                                formatLastActivity={formatLastActivity}
                                availableContainers={availableContainers}
                                cardIndex={cardIndex}
                                columnIndex={columnIndex}
                                columnCount={columnCount}
                            />
                        );
                    })}
                </div>
            ))}

            {!loading && services.length === 0 && (
                <div className="empty-state">{t("serviceList.empty")}</div>
            )}
        </section>
    );
};

export default ServiceList;