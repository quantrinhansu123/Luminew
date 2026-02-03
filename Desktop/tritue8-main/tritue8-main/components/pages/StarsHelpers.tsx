// Temporary file with stars management functions
export const createStarsSaveHandler = (
    editingStarsStudent: any,
    calculateTotalRewardStars: any,
    STARS_HISTORY_URL: string,
    userProfile: any,
    currentUser: any,
    setStarsHistory: any,
    setEditStarsModalOpen: any,
    setEditingStarsStudent: any,
    editStarsForm: any,
    message: any
) => {
    return async (adjustment: number, reason: string) => {
        if (!editingStarsStudent) return;

        try {
            console.log("⭐ Saving stars adjustment:", {
                studentId: editingStarsStudent.id,
                studentName: editingStarsStudent["Họ và tên"],
                adjustment,
                reason,
            });

            const currentTotal = calculateTotalRewardStars(editingStarsStudent.id);
            const newTotal = currentTotal + adjustment;

            const now = new Date();
            const starsRecord = {
                studentId: editingStarsStudent.id,
                "Thay đổi": adjustment,
                "Số sao trước": currentTotal,
                "Số sao sau": newTotal,
                "Lý do": reason,
                "Người chỉnh sửa": userProfile?.displayName || currentUser?.email || "Admin",
                "Ngày chỉnh sửa": now.toISOString().split("T")[0],
                "Giờ chỉnh sửa": now.toTimeString().split(" ")[0],
                "Loại thay đổi": "Điều chỉnh",
                Timestamp: now.toISOString(),
            };

            const response = await fetch(STARS_HISTORY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(starsRecord),
            });

            if (response.ok) {
                console.log("✅ Stars adjustment saved successfully");

                const refreshResponse = await fetch(
                    `${STARS_HISTORY_URL}?_=${new Date().getTime()}`,
                    { cache: "no-cache" }
                );
                const refreshData = await refreshResponse.json();
                if (refreshData) {
                    const historyArray = Object.keys(refreshData).map((key) => ({
                        id: key,
                        ...refreshData[key],
                    }));
                    historyArray.sort(
                        (a, b) =>
                            new Date(b.Timestamp || 0).getTime() -
                            new Date(a.Timestamp || 0).getTime()
                    );
                    setStarsHistory(historyArray);
                }

                setEditStarsModalOpen(false);
                setEditingStarsStudent(null);
                editStarsForm.resetFields();

                message.success(
                    `Đã ${adjustment > 0 ? "thêm" : "trừ"} ${Math.abs(adjustment)} sao thưởng cho ${editingStarsStudent["Họ và tên"]}!\nTổng mới: ${newTotal} ⭐`
                );
            } else {
                const errorText = await response.text();
                console.error("❌ Failed to save stars:", response.status, errorText);
                message.error(`Không lưu được điều chỉnh sao thưởng. Status: ${response.status}`);
            }
        } catch (error) {
            console.error("❌ Error saving stars:", error);
            message.error("Không lưu được điều chỉnh sao thưởng. Kiểm tra console để biết chi tiết.");
        }
    };
};

export const createStarsResetHandler = (
    editingStarsStudent: any,
    calculateTotalRewardStars: any,
    STARS_HISTORY_URL: string,
    userProfile: any,
    currentUser: any,
    setStarsHistory: any,
    setEditStarsModalOpen: any,
    setEditingStarsStudent: any,
    editStarsForm: any,
    message: any,
    Modal: any
) => {
    return async () => {
        if (!editingStarsStudent) return;

        Modal.confirm({
            title: "Xác nhận reset sao thưởng",
            content: `Bạn có chắc chắn muốn reset tất cả sao thưởng của ${editingStarsStudent["Họ và tên"]} về 0?`,
            okText: "Reset",
            okType: "danger",
            cancelText: "Hủy",
            onOk: async () => {
                try {
                    console.log("⭐ Resetting stars for:", editingStarsStudent.id);

                    const currentTotal = calculateTotalRewardStars(editingStarsStudent.id);

                    const now = new Date();
                    const resetRecord = {
                        studentId: editingStarsStudent.id,
                        "Thay đổi": -currentTotal,
                        "Số sao trước": currentTotal,
                        "Số sao sau": 0,
                        "Lý do": "Reset toàn bộ sao thưởng về 0",
                        "Người chỉnh sửa": userProfile?.displayName || currentUser?.email || "Admin",
                        "Ngày chỉnh sửa": now.toISOString().split("T")[0],
                        "Giờ chỉnh sửa": now.toTimeString().split(" ")[0],
                        "Loại thay đổi": "Reset",
                        Timestamp: now.toISOString(),
                    };

                    const response = await fetch(STARS_HISTORY_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(resetRecord),
                    });

                    if (response.ok) {
                        console.log("✅ Stars reset successfully");

                        const refreshResponse = await fetch(
                            `${STARS_HISTORY_URL}?_=${new Date().getTime()}`,
                            { cache: "no-cache" }
                        );
                        const refreshData = await refreshResponse.json();
                        if (refreshData) {
                            const historyArray = Object.keys(refreshData).map((key) => ({
                                id: key,
                                ...refreshData[key],
                            }));
                            historyArray.sort(
                                (a, b) =>
                                    new Date(b.Timestamp || 0).getTime() -
                                    new Date(a.Timestamp || 0).getTime()
                            );
                            setStarsHistory(historyArray);
                        }

                        setEditStarsModalOpen(false);
                        setEditingStarsStudent(null);
                        editStarsForm.resetFields();

                        message.success(
                            `Đã reset sao thưởng của ${editingStarsStudent["Họ và tên"]} về 0!`
                        );
                    } else {
                        const errorText = await response.text();
                        console.error("❌ Failed to reset stars:", response.status, errorText);
                        message.error(`Không reset được sao thưởng. Status: ${response.status}`);
                    }
                } catch (error) {
                    console.error("❌ Error resetting stars:", error);
                    message.error("Không reset được sao thưởng. Kiểm tra console để biết chi tiết.");
                }
            },
        });
    };
};
