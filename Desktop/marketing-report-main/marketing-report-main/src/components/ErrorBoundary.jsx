import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 max-w-lg mx-auto mt-10 bg-white rounded-lg shadow-md border border-red-200">
                    <h2 className="text-xl font-bold text-red-600 mb-2">Đã xảy ra lỗi!</h2>
                    <p className="text-gray-600 mb-4">
                        Ứng dụng gặp sự cố không mong muốn. Vui lòng tải lại trang hoặc liên hệ IT nếu lỗi vẫn tiếp diễn.
                    </p>
                    <details className="whitespace-pre-wrap text-sm text-gray-500 bg-gray-50 p-2 rounded border mb-4">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        onClick={() => window.location.reload()}
                    >
                        Tải lại trang
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
