import 'dart:js_interop';

@JS('adaSetLoadingStage')
external void _setLoadingStage(JSString stage);

@JS('adaHideLoading')
external void _hideLoading();

@JS('adaShowLoadingFailure')
external void _showLoadingFailure();

void updateWebBootstrapStage(String stage) {
  _setLoadingStage(stage.toJS);
}

void hideWebBootstrapLoader() {
  _hideLoading();
}

void showWebBootstrapFailure() {
  _showLoadingFailure();
}
